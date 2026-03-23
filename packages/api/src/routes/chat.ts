/**
 * Chat route for Bella's conversational interface.
 *
 * POST /chat — Streaming chat endpoint using AI SDK streamText with MC tools.
 * Uses LM Studio (OpenAI-compatible) for inference and MC data tools for
 * grounded responses (D-07). User identity resolved from request headers (D-03).
 */

import { Hono } from "hono";
import { streamText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getLmStudioStatus } from "../services/lm-studio.js";
import { createChatTools } from "../services/chat-tools.js";
import { resolveUser } from "../lib/user-identity.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

const DEFAULT_LM_STUDIO_URL = "http://100.123.8.125:1234";

/**
 * Build the system prompt with user context injected.
 * Instructs LM Studio to always use tools for data grounding (D-07).
 */
function buildSystemPrompt(user: { displayName: string; role: string }): string {
  const roleDesc = user.role === "owner" ? "the owner" : "a team member";

  return `You are Mission Control, Ryan's personal operating environment.
You are talking to ${user.displayName}, ${roleDesc}.

RULES:
- ALWAYS use tools to look up project status, captures, and activity. Never guess or make up project details.
- When asked "what's Ryan working on?", use listProjects and getRecentSessions to see current activity.
- When asked about a specific project, use getProjectStatus to get real data.
- When asked to remember or capture something, use createCapture.
- Present information conversationally, not as raw data dumps. Summarize and contextualize.
- If you don't have data to answer a question, say so honestly. Do not hallucinate project names or statuses.
- You can see iMessage conversation extracts -- use getImessageExtracts when asked about recent discussions.
- After gathering data with tools, synthesize a helpful response. Do not call the same tool twice with identical parameters.

CONTEXT:
- Ryan works in serial sprints -- one project gets intense focus for days/weeks, then he moves on.
- Mission Control tracks: projects (git repos), captures (thoughts/notes), sessions (Claude Code), health checks, knowledge (CLAUDE.md files).
- The MC API serves: dashboard (web), CLI, MCP server, iOS companion, and this chat.
- When explaining how MC works, be clear and educational -- ${user.displayName} is learning the platform.`;
}

/**
 * Create chat routes.
 *
 * @param getInstance - Returns the database instance
 * @param getConfig - Returns the MC config (for user registry)
 */
export function createChatRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null
) {
  return new Hono().post("/chat", async (c) => {
    // Parse and validate request body
    let messages: unknown[];
    try {
      const body = await c.req.json<{ messages?: unknown }>();
      if (
        !body.messages ||
        !Array.isArray(body.messages) ||
        body.messages.length === 0
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "messages must be a non-empty array",
            },
          },
          400
        );
      }
      messages = body.messages;
    } catch {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request body",
          },
        },
        400
      );
    }

    // Check LM Studio health
    const status = getLmStudioStatus();
    if (status.health !== "ready") {
      return c.json(
        {
          error: {
            code: "LLM_UNAVAILABLE",
            message: "MC intelligence is warming up",
          },
        },
        503
      );
    }

    // Resolve user identity from headers
    const config = getConfig();
    const headers = c.req.raw.headers;
    const user = resolveUser(
      { get: (name: string) => headers.get(name) ?? undefined },
      config?.users ?? []
    );

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(user);

    // Create LM Studio provider
    const lmStudioUrl = config?.lmStudio?.url ?? DEFAULT_LM_STUDIO_URL;
    const provider = createOpenAI({
      baseURL: `${lmStudioUrl}/v1`,
      apiKey: "lm-studio",
    });

    // Create tools with user's identity for capture attribution
    const tools = createChatTools(getInstance(), user.id);

    // Stream response with tool calling
    // stopWhen: stepCountIs(5) prevents infinite tool loops (per RESEARCH Pitfall 2)
    const streamArgs = {
      model: provider("qwen3-coder"),
      system: systemPrompt,
      messages: messages as Parameters<typeof streamText>[0]["messages"],
      tools,
      stopWhen: stepCountIs(5),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK v6 ToolSet inference with zodSchema tools
    const result = streamText(streamArgs as unknown as Parameters<typeof streamText>[0]);

    return result.toTextStreamResponse();
  });
}
