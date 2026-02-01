# Scoped Agents

This document describes the agent profiles and their capability restrictions.

## Overview

Instead of a single all-powerful agent, Mission Control uses multiple scoped agents, each with specific capabilities. This limits the blast radius of any potential compromise.

## Agent Profiles

### chat-readonly

**Purpose**: Simple Q&A without any tool access.

**Configuration**:
```typescript
const chatReadonly: AgentProfile = {
  name: "chat-readonly",
  systemPrompt: `You are a helpful assistant. Answer questions directly and concisely.
You do not have access to any tools or external systems.
If asked to perform actions, explain that you can only provide information.`,
  allowedTools: [],
  maxTokens: 2048,
  timeout: 30_000,
  trustLevels: ["internal", "authenticated", "untrusted"],
};
```

**Use Cases**:
- General knowledge questions
- Explanations and tutorials
- Untrusted user interactions

**Restrictions**:
- No file access
- No code execution
- No external API calls
- No task creation

---

### code-assistant

**Purpose**: Code exploration and review without modification capabilities.

**Configuration**:
```typescript
const codeAssistant: AgentProfile = {
  name: "code-assistant",
  systemPrompt: `You are a code assistant that helps with code review and exploration.
You can read files and search code, but you cannot modify anything.
Focus on understanding, explaining, and finding patterns in code.`,
  allowedTools: ["Read", "Glob", "Grep"],
  maxTokens: 4096,
  timeout: 60_000,
  trustLevels: ["internal", "authenticated"],
};
```

**Use Cases**:
- Code review
- Finding implementations
- Understanding codebases
- Bug investigation

**Restrictions**:
- Read-only file access
- No writes or edits
- No command execution
- Scoped to allowed paths

---

### task-orchestrator

**Purpose**: Multi-step task coordination with full tool access.

**Configuration**:
```typescript
const taskOrchestrator: AgentProfile = {
  name: "task-orchestrator",
  systemPrompt: `You are a task orchestrator that coordinates complex multi-step workflows.
You can read, write, and execute commands to complete tasks.
Always verify results and handle errors gracefully.
Log important actions for audit purposes.`,
  allowedTools: [
    "Read", "Write", "Edit",
    "Glob", "Grep",
    "Bash",
    "TaskDispatch",
  ],
  maxTokens: 8192,
  timeout: 300_000,
  trustLevels: ["internal"],
};
```

**Use Cases**:
- Feature implementation
- Refactoring tasks
- Build and deploy
- Complex automation

**Restrictions**:
- Internal trust only
- Command allowlist enforced
- Sandboxed execution
- Full audit logging

---

### health-processor

**Purpose**: System health monitoring and alerting.

**Configuration**:
```typescript
const healthProcessor: AgentProfile = {
  name: "health-processor",
  systemPrompt: `You process system health metrics and generate alerts.
Analyze metrics for anomalies and determine appropriate alert levels.
Be concise and actionable in your assessments.`,
  allowedTools: ["ReadMetrics", "WriteAlert"],
  maxTokens: 1024,
  timeout: 10_000,
  trustLevels: ["internal"],
};
```

**Use Cases**:
- Metric analysis
- Anomaly detection
- Alert generation
- Health summaries

**Restrictions**:
- Metrics access only
- Cannot modify code/files
- Cannot execute commands
- Short timeout

## Tool Definitions

### Tool Registry

```typescript
interface Tool {
  name: string;
  description: string;
  dangerLevel: "safe" | "moderate" | "dangerous";
  allowedPaths?: string[];  // Path restrictions
  allowedCommands?: string[];  // Command restrictions
}

const TOOLS: Record<string, Tool> = {
  Read: {
    name: "Read",
    description: "Read file contents",
    dangerLevel: "safe",
    allowedPaths: ["/home/mission", "/tmp"],
  },

  Write: {
    name: "Write",
    description: "Write file contents",
    dangerLevel: "moderate",
    allowedPaths: ["/home/mission/projects", "/tmp"],
  },

  Edit: {
    name: "Edit",
    description: "Edit file contents",
    dangerLevel: "moderate",
    allowedPaths: ["/home/mission/projects"],
  },

  Glob: {
    name: "Glob",
    description: "Search for files by pattern",
    dangerLevel: "safe",
  },

  Grep: {
    name: "Grep",
    description: "Search file contents",
    dangerLevel: "safe",
  },

  Bash: {
    name: "Bash",
    description: "Execute shell commands",
    dangerLevel: "dangerous",
    allowedCommands: [
      "git", "npm", "pnpm", "node",
      "cat", "ls", "head", "tail", "pwd",
    ],
  },

  TaskDispatch: {
    name: "TaskDispatch",
    description: "Dispatch tasks to compute nodes",
    dangerLevel: "moderate",
  },

  ReadMetrics: {
    name: "ReadMetrics",
    description: "Read system metrics",
    dangerLevel: "safe",
  },

  WriteAlert: {
    name: "WriteAlert",
    description: "Create system alert",
    dangerLevel: "safe",
  },
};
```

## Agent Selection Logic

```typescript
function selectAgent(
  request: ChatRequest,
  trustLevel: TrustLevel
): AgentProfile {
  // Get agents available at this trust level
  const available = Object.values(AGENTS).filter(
    (agent) => agent.trustLevels.includes(trustLevel)
  );

  // Determine intent from request
  const intent = classifyIntent(request.message);

  switch (intent) {
    case "code_exploration":
      return available.find((a) => a.name === "code-assistant")
        || available.find((a) => a.name === "chat-readonly")!;

    case "task_execution":
      return available.find((a) => a.name === "task-orchestrator")
        || available.find((a) => a.name === "code-assistant")
        || available.find((a) => a.name === "chat-readonly")!;

    case "health_check":
      return available.find((a) => a.name === "health-processor")
        || available.find((a) => a.name === "chat-readonly")!;

    default:
      return available.find((a) => a.name === "chat-readonly")!;
  }
}

function classifyIntent(message: string): Intent {
  const lowerMessage = message.toLowerCase();

  if (/\b(find|search|show|where|what)\b.*\b(code|file|function|class)\b/.test(lowerMessage)) {
    return "code_exploration";
  }

  if (/\b(create|implement|fix|update|refactor|build|deploy)\b/.test(lowerMessage)) {
    return "task_execution";
  }

  if (/\b(health|status|metrics|monitor)\b/.test(lowerMessage)) {
    return "health_check";
  }

  return "general";
}
```

## Execution Wrapper

```typescript
async function executeWithAgent(
  agent: AgentProfile,
  message: string,
  context: ExecutionContext
): Promise<AgentResult> {
  // Create tool filter
  const toolFilter = createToolFilter(agent.allowedTools);

  // Build execution options
  const options: ClaudeOptions = {
    systemPrompt: agent.systemPrompt,
    maxTokens: agent.maxTokens,
    timeout: agent.timeout,
    tools: toolFilter,
  };

  // Execute with timeout
  const result = await withTimeout(
    claude.execute(message, options),
    agent.timeout
  );

  // Validate output
  if (!isValidOutput(result)) {
    throw new Error("Invalid agent output");
  }

  // Log execution
  await logAudit({
    requestId: context.requestId,
    agent: agent.name,
    action: "EXECUTE",
    success: true,
    duration: result.duration,
  });

  return result;
}

function createToolFilter(allowed: string[]): ToolFilter {
  return (tool: string) => {
    if (!allowed.includes(tool)) {
      return { allowed: false, reason: `Tool ${tool} not in agent scope` };
    }

    const definition = TOOLS[tool];
    return {
      allowed: true,
      restrictions: {
        paths: definition.allowedPaths,
        commands: definition.allowedCommands,
      },
    };
  };
}
```

## Adding New Agents

To add a new agent:

1. **Define the profile** in `packages/hub/src/agents/profiles.ts`
2. **Specify allowed tools** - minimum necessary
3. **Set trust levels** - who can use it
4. **Write system prompt** - clear boundaries
5. **Add selection logic** - when to use it
6. **Test thoroughly** - including edge cases

Example:

```typescript
const newAgent: AgentProfile = {
  name: "documentation-writer",
  systemPrompt: `You write and update documentation.
You can read code to understand it, and write markdown files.
Focus on clarity and accuracy.`,
  allowedTools: ["Read", "Glob", "Grep", "Write"],
  maxTokens: 4096,
  timeout: 120_000,
  trustLevels: ["internal"],
};
```

## Security Considerations

1. **Least privilege** - Each agent gets minimum necessary tools
2. **Defense in depth** - Multiple layers still apply
3. **Audit everything** - All agent actions logged
4. **Test boundaries** - Verify tool restrictions work
5. **Review regularly** - Adjust scopes based on usage patterns
