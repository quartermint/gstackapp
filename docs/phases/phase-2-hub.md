# Phase 2: Hub Deployment

This phase sets up the Hetzner Hub server with Claude CLI and the security pipeline.

## Overview

The Hub is the central orchestration point:
- Runs Claude CLI with Max subscription
- Implements security pipeline
- Coordinates tasks across compute nodes
- Syncs state to Convex

## Prerequisites

- Hetzner account
- Tailscale configured (Phase 1)
- Convex deployed (Phase 1)
- Claude Max subscription

## Part 1: Server Setup

### 1.1 Create Hetzner VPS

1. Log into Hetzner Cloud Console
2. Create new server:
   - Location: Falkenstein or Frankfurt
   - Image: Ubuntu 24.04
   - Type: CAX11 (2 vCPU, 4GB RAM, €4.51/mo)
   - SSH key: Add your public key
   - Name: `mission-control-hub`

### 1.2 Initial Server Setup

```bash
# SSH into server
ssh root@<server-ip>

# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl git build-essential

# Create service user
useradd -m -s /bin/bash mission
usermod -aG sudo mission

# Set up SSH for mission user
mkdir -p /home/mission/.ssh
cp ~/.ssh/authorized_keys /home/mission/.ssh/
chown -R mission:mission /home/mission/.ssh
```

### 1.3 Install Node.js

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm
```

### 1.4 Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-xxxxx --hostname=hub
```

## Part 2: Claude CLI Setup

### 2.1 Install Claude CLI

```bash
# As mission user
su - mission

# Install Claude CLI
npm install -g @anthropic-ai/claude-cli

# Authenticate with Claude Max
claude auth login
# Follow the browser flow to authenticate
```

### 2.2 Verify Claude CLI

```bash
# Test the CLI
claude "Hello, can you hear me?"

# Check status
claude --version
```

## Part 3: Hub Service

### 3.1 Clone Repository

```bash
cd /home/mission
git clone https://github.com/yourusername/mission-control.git
cd mission-control
pnpm install
```

### 3.2 Configure Environment

```bash
# Create environment file
cat > /home/mission/mission-control/.env << 'EOF'
NODE_ENV=production
PORT=3000

# Convex
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:xxxxx

# Security
JWT_SECRET=your-secure-secret-here
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Tailscale
TAILSCALE_TAILNET=yourname.ts.net
EOF

chmod 600 /home/mission/mission-control/.env
```

### 3.3 Build Hub Service

```bash
cd /home/mission/mission-control
pnpm --filter hub build
```

### 3.4 Create Systemd Service

```bash
sudo cat > /etc/systemd/system/mission-hub.service << 'EOF'
[Unit]
Description=Mission Control Hub
After=network.target tailscaled.service

[Service]
Type=simple
User=mission
WorkingDirectory=/home/mission/mission-control/packages/hub
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mission-hub
sudo systemctl start mission-hub
```

### 3.5 Verify Service

```bash
# Check status
sudo systemctl status mission-hub

# Check logs
sudo journalctl -u mission-hub -f

# Test endpoint
curl http://localhost:3000/health
```

## Part 4: Security Pipeline Implementation

The Hub implements the full security pipeline. Key files:

### 4.1 Request Handler

`packages/hub/src/routes/chat.ts`:

```typescript
import { ChatRequestSchema, ChatResponseSchema } from "@mission-control/shared";
import { sanitizeInput } from "../services/sanitizer";
import { classifyTrust } from "../services/trust";
import { selectAgent, executeAgent } from "../services/agents";
import { logAudit } from "../services/audit";

export async function handleChat(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Stage 1: Parse
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("INVALID_REQUEST", parsed.error.message, requestId);
    }

    // Stage 2: Sanitize
    const sanitized = sanitizeInput(parsed.data.message);
    if (sanitized.blocked) {
      await logAudit({
        requestId,
        action: "BLOCKED",
        reason: sanitized.reason,
      });
      return errorResponse("BLOCKED", sanitized.reason, requestId);
    }

    // Stage 3: Classify
    const trustLevel = classifyTrust(req);

    // Stage 4: Route
    const agent = selectAgent(parsed.data, trustLevel);

    // Stage 5: Execute
    const result = await executeAgent(agent, sanitized.sanitized);

    // Stage 6: Validate
    const response = ChatResponseSchema.parse({
      message: result.content,
      requestId,
    });

    // Log success
    await logAudit({
      requestId,
      action: "SUCCESS",
      agent: agent.name,
      duration: Date.now() - startTime,
    });

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await logAudit({
      requestId,
      action: "ERROR",
      error: error.message,
    });
    return errorResponse("INTERNAL_ERROR", "An error occurred", requestId);
  }
}
```

### 4.2 Agent Executor

`packages/hub/src/services/agents.ts`:

```typescript
import { spawn } from "child_process";

export async function executeAgent(
  agent: AgentProfile,
  message: string
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "--system", agent.systemPrompt,
      "--max-tokens", String(agent.maxTokens),
    ];

    if (agent.allowedTools.length > 0) {
      args.push("--tools", agent.allowedTools.join(","));
    }

    const proc = spawn("claude", [...args, message], {
      timeout: agent.timeout,
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ content: output.trim() });
      } else {
        reject(new Error(`Agent exited with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}
```

## Part 5: Monitoring

### 5.1 Health Check Endpoint

```typescript
app.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: Date.now(),
    uptime: process.uptime(),
    tailscale: await checkTailscale(),
    convex: await checkConvex(),
  };
  res.json(health);
});
```

### 5.2 Log Aggregation

Configure journald forwarding or set up a log aggregator.

## Verification Checklist

- [ ] Hetzner VPS created and accessible
- [ ] Tailscale connected
- [ ] Claude CLI installed and authenticated
- [ ] Hub service running
- [ ] Health endpoint responding
- [ ] Security pipeline tested
- [ ] Logs visible in journald
- [ ] Convex sync working

## Troubleshooting

### Claude CLI auth issues
```bash
claude auth logout
claude auth login
```

### Service won't start
```bash
sudo journalctl -u mission-hub -n 50
# Check for missing env vars or permissions
```

### Tailscale connection issues
```bash
tailscale status
tailscale ping macmini
```

## Next Steps

Proceed to [Phase 3: Worker Deployment](phase-3-worker.md)
