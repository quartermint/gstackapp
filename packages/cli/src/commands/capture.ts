import { Command } from "commander";
import { createCapture, McApiUnreachable } from "../api-client.js";
import { enqueue, readQueue, clearQueue } from "../queue.js";
import { detectProjectFromCwd } from "../project-detect.js";
import { success, warn, error, colors } from "../output.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function flushQueue(): Promise<number> {
  const queued = readQueue();
  if (queued.length === 0) return 0;

  let flushed = 0;
  const failures: typeof queued = [];

  for (const item of queued) {
    try {
      await createCapture({
        rawContent: item.rawContent,
        projectId: item.projectId,
      });
      flushed++;
    } catch {
      failures.push(item);
    }
  }

  if (failures.length === 0) {
    clearQueue();
  } else {
    // Rewrite queue with only failures
    clearQueue();
    for (const item of failures) {
      enqueue(item);
    }
  }

  return flushed;
}

export const captureCommand = new Command("capture")
  .description("Send a capture to Mission Control")
  .argument("[thought...]", "The thought to capture")
  .option("-p, --project <slug>", "Assign to project (skips AI categorization)")
  .action(async (thoughtParts: string[], opts: { project?: string }) => {
    try {
      // Get content from args or stdin
      let content: string;
      if (!process.stdin.isTTY && thoughtParts.length === 0) {
        // Piped input
        content = await readStdin();
      } else if (thoughtParts.length > 0) {
        content = thoughtParts.join(" ");
      } else {
        error("No content provided. Usage: mc capture \"your thought\" or echo \"idea\" | mc capture");
        process.exit(1);
      }

      if (!content) {
        error("Empty content. Nothing to capture.");
        process.exit(1);
      }

      if (content.length > 10000) {
        error(`Content too long (${content.length} chars, max 10000).`);
        process.exit(1);
      }

      // Determine project
      let projectId = opts.project ?? undefined;
      if (!projectId) {
        // Auto-detect from cwd
        const detected = await detectProjectFromCwd(process.cwd());
        if (detected) {
          projectId = detected;
        }
      }

      // Send to API
      try {
        const result = await createCapture({
          rawContent: content,
          projectId,
        });

        const projectName = result.capture.aiProjectSlug ?? result.capture.projectId ?? "unassigned";
        success(`Captured to ${colors.bold(projectName)} ${colors.dim(`(${result.capture.id.slice(0, 8)})`)}`);

        // Flush any queued captures
        const flushed = await flushQueue();
        if (flushed > 0) {
          success(`Flushed ${flushed} queued capture${flushed > 1 ? "s" : ""}`);
        }

        process.exit(0);
      } catch (e) {
        if (e instanceof McApiUnreachable) {
          // Offline -- queue it
          enqueue({
            rawContent: content,
            projectId,
            queuedAt: new Date().toISOString(),
          });
          warn("Queued locally (MC unreachable). Will sync on next successful call.");
          process.exit(2);
        }
        throw e;
      }
    } catch (e) {
      if (e instanceof Error) {
        error(e.message);
      } else {
        error("Unexpected error");
      }
      process.exit(1);
    }
  });
