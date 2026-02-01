# Phase 4: Compute Nodes

This phase sets up Mac compute nodes for heavy processing, code execution, and sandbox environments.

## Overview

Compute nodes handle:
- CPU-intensive tasks
- Code execution in sandboxes
- Long-running processes
- Local file access

```
Hub → Tailscale → Mac mini (always-on)
                → MacBook (on-demand)
```

## Prerequisites

- Mac mini or MacBook with macOS 14+
- Tailscale connected (Phase 1)
- Hub deployed (Phase 2)

## Part 1: Base Setup

### 1.1 Install Dependencies

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@20

# Install pnpm
npm install -g pnpm

# Verify Tailscale
tailscale status
```

### 1.2 Clone Repository

```bash
cd ~
git clone https://github.com/yourusername/mission-control.git
cd mission-control
pnpm install
```

### 1.3 Configure Environment

```bash
cat > ~/mission-control/.env.local << 'EOF'
NODE_ENV=production
PORT=3001
NODE_TYPE=compute
HOSTNAME=macmini

# Hub connection
HUB_URL=http://100.x.x.x:3000

# Convex
CONVEX_URL=https://your-deployment.convex.cloud

# Sandbox
SANDBOX_ENABLED=true
SANDBOX_WORKDIR=/tmp/mission-sandbox
SANDBOX_TIMEOUT=300000
EOF
```

## Part 2: Compute Service

### 2.1 Build Service

```bash
cd ~/mission-control
pnpm --filter compute build
```

### 2.2 Service Implementation

`packages/compute/src/index.ts`:

```typescript
import Fastify from "fastify";
import { executeTask } from "./executor";
import { registerWithHub } from "./registration";

const app = Fastify({ logger: true });

// Health check
app.get("/health", async () => ({
  status: "healthy",
  hostname: process.env.HOSTNAME,
  uptime: process.uptime(),
}));

// Task execution endpoint
app.post("/execute", async (request, reply) => {
  const { taskId, type, payload } = request.body as TaskRequest;

  try {
    const result = await executeTask(type, payload);
    return { taskId, status: "completed", result };
  } catch (error) {
    return reply.status(500).send({
      taskId,
      status: "failed",
      error: error.message,
    });
  }
});

// Start server and register
async function start() {
  await app.listen({ port: parseInt(process.env.PORT || "3001"), host: "0.0.0.0" });

  // Register with Hub
  await registerWithHub({
    hostname: process.env.HOSTNAME!,
    type: "compute",
    capabilities: ["shell", "code", "build"],
    port: parseInt(process.env.PORT || "3001"),
  });

  // Start heartbeat
  setInterval(() => registerWithHub({ /* ... */ }), 30000);
}

start();
```

### 2.3 Task Executor

`packages/compute/src/executor.ts`:

```typescript
import { spawn } from "child_process";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const COMMAND_ALLOWLIST = new Set([
  "git", "npm", "pnpm", "node", "cat", "ls", "head", "tail", "pwd",
]);

interface ExecuteOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
}

export async function executeTask(
  type: string,
  payload: any
): Promise<any> {
  switch (type) {
    case "shell":
      return executeShell(payload);
    case "code":
      return executeCode(payload);
    case "build":
      return executeBuild(payload);
    default:
      throw new Error(`Unknown task type: ${type}`);
  }
}

async function executeShell(payload: { command: string }): Promise<string> {
  const parts = payload.command.split(" ");
  const cmd = parts[0];

  // Validate against allowlist
  if (!COMMAND_ALLOWLIST.has(cmd)) {
    throw new Error(`Command not allowed: ${cmd}`);
  }

  return runCommand({
    command: cmd,
    args: parts.slice(1),
    timeout: 60000,
  });
}

async function executeCode(payload: {
  language: string;
  code: string;
}): Promise<string> {
  const sandboxDir = join(process.env.SANDBOX_WORKDIR!, crypto.randomUUID());
  await mkdir(sandboxDir, { recursive: true });

  try {
    // Write code to file
    const ext = payload.language === "python" ? "py" : "js";
    const filename = `code.${ext}`;
    await Bun.write(join(sandboxDir, filename), payload.code);

    // Execute in sandbox
    const runner = payload.language === "python" ? "python3" : "node";
    return runCommand({
      command: runner,
      args: [filename],
      cwd: sandboxDir,
      timeout: parseInt(process.env.SANDBOX_TIMEOUT || "300000"),
    });
  } finally {
    // Cleanup sandbox
    await rm(sandboxDir, { recursive: true, force: true });
  }
}

async function executeBuild(payload: {
  repoPath: string;
  command: string;
}): Promise<string> {
  return runCommand({
    command: "pnpm",
    args: payload.command.split(" "),
    cwd: payload.repoPath,
    timeout: 600000, // 10 minutes
  });
}

function runCommand(options: ExecuteOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(options.command, options.args || [], {
      cwd: options.cwd,
      timeout: options.timeout,
      env: {
        ...process.env,
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Exit code: ${code}`));
      }
    });

    proc.on("error", reject);
  });
}
```

## Part 3: Launch Agent

### 3.1 Create Launch Agent

```bash
cat > ~/Library/LaunchAgents/com.mission-control.compute.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mission-control.compute</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/yourusername/mission-control/packages/compute/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/yourusername/mission-control/packages/compute</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>3001</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/yourusername/Library/Logs/mission-control-compute.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/yourusername/Library/Logs/mission-control-compute.error.log</string>
</dict>
</plist>
EOF
```

### 3.2 Load Launch Agent

```bash
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist

# Verify it's running
launchctl list | grep mission-control
```

### 3.3 Manage Service

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.mission-control.compute.plist

# Start
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist

# View logs
tail -f ~/Library/Logs/mission-control-compute.log
```

## Part 4: Sandbox Security

### 4.1 Create Sandbox Profile

For additional isolation, use macOS sandbox-exec:

```bash
cat > ~/mission-control/packages/compute/sandbox.sb << 'EOF'
(version 1)
(deny default)

; Allow read access to system
(allow file-read*
    (subpath "/usr/lib")
    (subpath "/usr/local/lib")
    (subpath "/System/Library"))

; Allow execution
(allow process-exec
    (subpath "/usr/bin")
    (subpath "/usr/local/bin"))

; Allow network (for npm, etc.)
(allow network-outbound)

; Allow temp access
(allow file-read* file-write*
    (subpath "/tmp/mission-sandbox"))

; Deny access to sensitive paths
(deny file-read* file-write*
    (subpath "/Users")
    (subpath "/private/var"))
EOF
```

### 4.2 Use Sandbox in Executor

```typescript
async function runSandboxed(command: string, args: string[]): Promise<string> {
  return runCommand({
    command: "sandbox-exec",
    args: ["-f", "sandbox.sb", command, ...args],
    timeout: 60000,
  });
}
```

## Part 5: MacBook On-Demand Setup

For MacBook, the service only runs when the laptop is available:

### 5.1 Modified Launch Agent

```xml
<key>KeepAlive</key>
<dict>
    <key>NetworkState</key>
    <true/>
</dict>
```

### 5.2 Wake-on-LAN (Optional)

Enable in System Preferences → Battery → Options → Wake for network access.

## Verification Checklist

- [ ] Node.js and pnpm installed
- [ ] Repository cloned and built
- [ ] Environment configured
- [ ] Launch agent created and loaded
- [ ] Service responding on port 3001
- [ ] Registered with Hub
- [ ] Health check passing
- [ ] Sandbox working
- [ ] Command allowlist enforced
- [ ] Logs capturing output

## Testing

### Test Health

```bash
curl http://localhost:3001/health
```

### Test Task Execution

```bash
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-1",
    "type": "shell",
    "payload": { "command": "ls -la" }
  }'
```

### Test Code Execution

```bash
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-2",
    "type": "code",
    "payload": {
      "language": "javascript",
      "code": "console.log(1 + 1)"
    }
  }'
```

## Troubleshooting

### Service won't start
```bash
# Check logs
cat ~/Library/Logs/mission-control-compute.error.log

# Verify Node.js path
which node
```

### Can't connect from Hub
```bash
# Verify Tailscale
tailscale status

# Check firewall
sudo pfctl -sr | grep 3001
```

## Next Steps

Proceed to [Phase 5: Mobile Apps](phase-5-mobile.md)
