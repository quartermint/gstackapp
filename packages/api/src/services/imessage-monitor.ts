import Database from "better-sqlite3";
import { eventBus } from "./event-bus.js";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../db/index.js";
import { createCapture } from "../db/queries/captures.js";
import { enrichCapture } from "./enrichment.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds between Unix epoch (1970-01-01) and Apple/Core Data epoch (2001-01-01). */
const APPLE_EPOCH_OFFSET = 978307200;

/** Apple stores message timestamps as nanoseconds since 2001-01-01. */
const NANOSECOND_DIVISOR = 1_000_000_000;

/** Default polling interval: 5 minutes. */
const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Convert an Apple nanosecond timestamp (nanoseconds since 2001-01-01)
 * to a JavaScript Date.
 */
export function convertAppleTimestamp(appleNanos: number): Date {
  const unixSeconds = appleNanos / NANOSECOND_DIVISOR + APPLE_EPOCH_OFFSET;
  return new Date(unixSeconds * 1000);
}

/**
 * Convert a JavaScript Date back to Apple nanosecond timestamp.
 */
export function dateToAppleNanos(date: Date): number {
  const unixSeconds = date.getTime() / 1000;
  return (unixSeconds - APPLE_EPOCH_OFFSET) * NANOSECOND_DIVISOR;
}

// ---------------------------------------------------------------------------
// attributedBody extraction
// ---------------------------------------------------------------------------

/**
 * Extract readable text from the binary `attributedBody` column
 * when the `text` column is NULL.
 *
 * iMessage stores rich text as a binary-encoded NSAttributedString.
 * We search for the readable UTF-8 string content between plist markers.
 */
export function extractAttributedBodyText(
  attributedBody: Buffer | null
): string | null {
  if (!attributedBody || attributedBody.length === 0) return null;

  try {
    // Strategy 1: look for NSString marker followed by readable text
    const str = attributedBody.toString("binary");
    const nsStringMatch = str.match(
      /NSString\x01.(.+?)(?:\x00|\x04|\x06|\x84)/s
    );
    if (nsStringMatch?.[1]) {
      const cleaned = nsStringMatch[1].trim();
      if (cleaned.length > 0) return cleaned;
    }

    // Strategy 2: scan for long runs of printable ASCII/UTF-8 characters
    const utf8Str = attributedBody.toString("utf-8");
    const runs = utf8Str.match(/[\x20-\x7E\u00A0-\uFFFF]{6,}/g);
    if (runs && runs.length > 0) {
      // Take the longest run as likely the message text
      const longest = runs.reduce((a, b) => (a.length > b.length ? a : b));
      return longest.trim();
    }
  } catch {
    // Binary parsing can throw -- return null gracefully
  }

  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IMessageEntry {
  messageId: number;
  text: string;
  isFromMe: boolean;
  handleId: string;
  chatIdentifier: string;
  timestamp: Date;
  conversationPartner: string;
}

export interface IMessageMonitorConfig {
  chatDbPath: string;
  contacts: string[];
  pollIntervalMs: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

interface ChatDbRow {
  messageId: number;
  text: string | null;
  attributedBody: Buffer | null;
  appleDate: number;
  isFromMe: number;
  handleId: string | null;
  chatIdentifier: string;
}

/**
 * Poll chat.db for new messages from the specified contacts
 * after `sinceAppleNanos`. Opens the database read-only and
 * closes it immediately after the query.
 */
export function pollNewMessages(
  chatDbPath: string,
  contactIdentifiers: string[],
  sinceAppleNanos: number
): { messages: IMessageEntry[]; latestTimestamp: number } {
  const db = new Database(chatDbPath, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout = 1000");

  try {
    const placeholders = contactIdentifiers.map(() => "?").join(",");
    const query = `
      SELECT
        m.ROWID as messageId,
        m.text,
        m.attributedBody,
        m.date as appleDate,
        m.is_from_me as isFromMe,
        h.id as handleId,
        c.chat_identifier as chatIdentifier
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat c ON c.ROWID = cmj.chat_id
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE c.chat_identifier IN (${placeholders})
        AND m.date > ?
      ORDER BY m.date ASC
    `;

    const rows = db.prepare(query).all(
      ...contactIdentifiers,
      sinceAppleNanos
    ) as ChatDbRow[];

    const messages: IMessageEntry[] = [];
    let latestTimestamp = sinceAppleNanos;

    for (const row of rows) {
      // Resolve text: prefer text column, fall back to attributedBody
      let messageText = row.text;
      if (!messageText) {
        messageText = extractAttributedBodyText(row.attributedBody);
      }

      // Skip messages where no text could be extracted
      if (!messageText) {
        console.warn(
          `iMessage: skipping message ${row.messageId} — no text or attributedBody content`
        );
        continue;
      }

      const timestamp = convertAppleTimestamp(row.appleDate);
      const handleId = row.handleId ?? "unknown";

      messages.push({
        messageId: row.messageId,
        text: messageText,
        isFromMe: row.isFromMe === 1,
        handleId,
        chatIdentifier: row.chatIdentifier,
        timestamp,
        conversationPartner: row.chatIdentifier,
      });

      if (row.appleDate > latestTimestamp) {
        latestTimestamp = row.appleDate;
      }
    }

    return { messages, latestTimestamp };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Monitor lifecycle
// ---------------------------------------------------------------------------

/**
 * Start polling iMessage chat.db on a configurable interval.
 *
 * Creates captures for each new message and triggers enrichment.
 * Returns the interval handle for cleanup, or null if disabled.
 */
export function startIMessageMonitor(
  mcDb: DrizzleDb,
  config: IMessageMonitorConfig
): ReturnType<typeof setInterval> | null {
  if (!config.enabled || config.contacts.length === 0) {
    if (!config.enabled) {
      console.log("iMessage monitor disabled in config.");
    } else {
      console.log("iMessage monitor: no contacts configured.");
    }
    return null;
  }

  // Start 24 hours ago so we don't miss recent messages on first run
  let lastSeenTimestamp = dateToAppleNanos(
    new Date(Date.now() - 86_400_000)
  );

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const poll = async () => {
    try {
      const { messages, latestTimestamp } = pollNewMessages(
        config.chatDbPath,
        config.contacts,
        lastSeenTimestamp
      );

      for (const msg of messages) {
        // Build capture content with speaker attribution
        const speaker = msg.isFromMe ? "Ryan" : msg.conversationPartner;
        const captureContent = `${speaker}: ${msg.text}\nFrom conversation with ${msg.conversationPartner}`;

        // Create capture in MC database
        const capture = createCapture(mcDb, {
          rawContent: captureContent,
          type: "text",
          sourceType: "imessage",
        });

        // Fire-and-forget enrichment
        queueMicrotask(() =>
          enrichCapture(mcDb, capture.id).catch((err) =>
            console.error(`iMessage: enrichment failed for ${capture.id}:`, err)
          )
        );
      }

      if (messages.length > 0) {
        // Emit SSE event for dashboard
        eventBus.emit("mc:event", {
          type: "capture:created",
          id: nanoid(),
          data: {
            subtype: "imessage",
            count: messages.length,
          },
        });

        lastSeenTimestamp = latestTimestamp;
        console.log(`iMessage: polled ${messages.length} new message(s)`);
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : String(err);

      // Handle TCC/Full Disk Access permission errors
      if (
        errMsg.includes("SQLITE_CANTOPEN") ||
        errMsg.includes("EPERM") ||
        errMsg.includes("operation not permitted")
      ) {
        console.error(
          "iMessage: Full Disk Access required. Grant in System Settings > Privacy & Security > Full Disk Access."
        );
        // Disable further polling to avoid log spam
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = null;
        }
        return;
      }

      console.error("iMessage: poll error:", errMsg);
    }
  };

  // Run immediately on startup, then on interval
  poll();
  intervalHandle = setInterval(poll, config.pollIntervalMs);

  return intervalHandle;
}
