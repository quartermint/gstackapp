import {
  existsSync,
  readFileSync,
  unlinkSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { getConfigDir, ensureConfigDir } from "./config.js";

const QUEUE_FILENAME = "queue.jsonl";

export interface QueuedCapture {
  rawContent: string;
  projectId?: string;
  queuedAt: string;
}

function getQueuePath(): string {
  return join(getConfigDir(), QUEUE_FILENAME);
}

/** Append a capture to the offline queue */
export function enqueue(capture: QueuedCapture): void {
  ensureConfigDir();
  const line = JSON.stringify(capture) + "\n";
  appendFileSync(getQueuePath(), line, "utf-8");
}

/** Read all queued captures. Returns empty array if no queue file. */
export function readQueue(): QueuedCapture[] {
  const path = getQueuePath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];

  const items: QueuedCapture[] = [];
  for (const line of content.split("\n")) {
    try {
      items.push(JSON.parse(line) as QueuedCapture);
    } catch {
      // Skip corrupt lines
    }
  }
  return items;
}

/** Remove the queue file after successful flush */
export function clearQueue(): void {
  const path = getQueuePath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/** Get count of queued items without parsing */
export function queueCount(): number {
  const path = getQueuePath();
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return 0;
  return content.split("\n").length;
}
