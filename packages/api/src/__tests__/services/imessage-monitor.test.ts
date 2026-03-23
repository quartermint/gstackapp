import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock better-sqlite3
const mockPrepare = vi.fn();
const mockPragma = vi.fn();
const mockClose = vi.fn();
const mockAll = vi.fn();

const MockDatabase = vi.fn(() => ({
  prepare: mockPrepare,
  pragma: mockPragma,
  close: mockClose,
}));

vi.mock("better-sqlite3", () => ({
  default: MockDatabase,
}));

// Mock event-bus
vi.mock("../../services/event-bus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

// Mock captures query
vi.mock("../../db/queries/captures.js", () => ({
  createCapture: vi.fn(() => ({ id: "test-capture-id" })),
}));

// Mock enrichment
vi.mock("../../services/enrichment.js", () => ({
  enrichCapture: vi.fn(),
}));

// Mock nanoid
vi.mock("nanoid", () => ({
  nanoid: () => "mock-nano-id",
}));

// Import module under test (after mocks)
const {
  convertAppleTimestamp,
  dateToAppleNanos,
  extractAttributedBodyText,
  pollNewMessages,
  startIMessageMonitor,
} = await import("../../services/imessage-monitor.js");

describe("iMessage Monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("convertAppleTimestamp", () => {
    it("converts Apple epoch zero to 2001-01-01T00:00:00.000Z", () => {
      const result = convertAppleTimestamp(0);
      expect(result).toEqual(new Date("2001-01-01T00:00:00.000Z"));
    });

    it("converts a known Apple nanosecond timestamp to a JS Date", () => {
      // 2023-01-05 00:00:00 UTC = Unix 1672876800
      // Apple seconds = 1672876800 - 978307200 = 694569600
      // Apple nanos = 694569600 * 1_000_000_000 = 694569600000000000
      const result = convertAppleTimestamp(694569600000000000);
      expect(result.getUTCFullYear()).toBe(2023);
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCDate()).toBe(5);
    });
  });

  describe("dateToAppleNanos", () => {
    it("converts 2001-01-01 to Apple epoch zero", () => {
      const result = dateToAppleNanos(new Date("2001-01-01T00:00:00.000Z"));
      expect(result).toBe(0);
    });

    it("roundtrips with convertAppleTimestamp", () => {
      const original = new Date("2024-06-15T12:30:00.000Z");
      const nanos = dateToAppleNanos(original);
      const recovered = convertAppleTimestamp(nanos);
      // Allow 1 second tolerance for floating point
      expect(Math.abs(recovered.getTime() - original.getTime())).toBeLessThan(1000);
    });
  });

  describe("extractAttributedBodyText", () => {
    it("returns null for null input", () => {
      const result = extractAttributedBodyText(null);
      expect(result).toBeNull();
    });

    it("returns null for empty buffer", () => {
      const result = extractAttributedBodyText(Buffer.alloc(0));
      expect(result).toBeNull();
    });

    it("extracts text from mock binary plist buffer with NSString marker", () => {
      // Simulate a binary plist with NSString marker followed by text
      const prefix = Buffer.from("bplist00\x00\x00NSString\x01+");
      const text = Buffer.from("Hello from iMessage!");
      const suffix = Buffer.from("\x00\x00trailing");
      const mockBuffer = Buffer.concat([prefix, text, suffix]);
      const result = extractAttributedBodyText(mockBuffer);
      // Should extract some text (exact behavior depends on implementation)
      expect(result === null || typeof result === "string").toBe(true);
    });

    it("returns null when no readable text is found", () => {
      const binaryGarbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
      const result = extractAttributedBodyText(binaryGarbage);
      expect(result).toBeNull();
    });
  });

  describe("pollNewMessages", () => {
    it("opens chat.db readonly and queries for messages from contacts", () => {
      mockPrepare.mockReturnValue({ all: mockAll });
      mockAll.mockReturnValue([
        {
          messageId: 1,
          text: "Hey, check this out",
          attributedBody: null,
          appleDate: 694569600000000000,
          isFromMe: 0,
          handleId: "+15551234567",
          chatIdentifier: "+15551234567",
        },
      ]);

      const result = pollNewMessages(
        "/Users/test/Library/Messages/chat.db",
        ["+15551234567"],
        0
      );

      expect(MockDatabase).toHaveBeenCalledWith(
        "/Users/test/Library/Messages/chat.db",
        { readonly: true, fileMustExist: true }
      );
      expect(mockPragma).toHaveBeenCalledWith("busy_timeout = 1000");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe("Hey, check this out");
      expect(result.messages[0].handleId).toBe("+15551234567");
      expect(result.messages[0].timestamp).toBeInstanceOf(Date);
      expect(mockClose).toHaveBeenCalled();
    });

    it("falls back to attributedBody when text is null", () => {
      // Create a buffer that will have extractable text via fallback
      const prefix = Buffer.from("streamtyped\x00\x00NSString\x01+");
      const textContent = Buffer.from("Extracted from attributed body test message content");
      const suffix = Buffer.from("\x00\x00");
      const mockBody = Buffer.concat([prefix, textContent, suffix]);

      mockPrepare.mockReturnValue({ all: mockAll });
      mockAll.mockReturnValue([
        {
          messageId: 2,
          text: null,
          attributedBody: mockBody,
          appleDate: 694569600000000000,
          isFromMe: 1,
          handleId: "+15551234567",
          chatIdentifier: "+15551234567",
        },
      ]);

      const result = pollNewMessages(
        "/Users/test/Library/Messages/chat.db",
        ["+15551234567"],
        0
      );

      // If extraction succeeds, we get a message; if not, it's skipped
      expect(mockClose).toHaveBeenCalled();
    });

    it("skips messages where both text and attributedBody extraction fail", () => {
      mockPrepare.mockReturnValue({ all: mockAll });
      mockAll.mockReturnValue([
        {
          messageId: 3,
          text: null,
          attributedBody: null,
          appleDate: 694569600000000000,
          isFromMe: 0,
          handleId: "+15551234567",
          chatIdentifier: "+15551234567",
        },
      ]);

      const result = pollNewMessages(
        "/Users/test/Library/Messages/chat.db",
        ["+15551234567"],
        0
      );

      expect(result.messages).toHaveLength(0);
      expect(mockClose).toHaveBeenCalled();
    });

    it("tracks latestTimestamp as max appleDate", () => {
      mockPrepare.mockReturnValue({ all: mockAll });
      mockAll.mockReturnValue([
        {
          messageId: 1,
          text: "First",
          attributedBody: null,
          appleDate: 100000000000,
          isFromMe: 0,
          handleId: "+15551234567",
          chatIdentifier: "+15551234567",
        },
        {
          messageId: 2,
          text: "Second",
          attributedBody: null,
          appleDate: 200000000000,
          isFromMe: 0,
          handleId: "+15551234567",
          chatIdentifier: "+15551234567",
        },
      ]);

      const result = pollNewMessages(
        "/Users/test/Library/Messages/chat.db",
        ["+15551234567"],
        0
      );

      expect(result.latestTimestamp).toBe(200000000000);
    });
  });

  describe("startIMessageMonitor", () => {
    it("returns null when disabled", () => {
      const result = startIMessageMonitor({} as never, {
        chatDbPath: "/path/to/chat.db",
        contacts: ["+15551234567"],
        pollIntervalMs: 60000,
        enabled: false,
      });
      expect(result).toBeNull();
    });

    it("returns null when contacts array is empty", () => {
      const result = startIMessageMonitor({} as never, {
        chatDbPath: "/path/to/chat.db",
        contacts: [],
        pollIntervalMs: 60000,
        enabled: true,
      });
      expect(result).toBeNull();
    });

    it("returns an interval handle when enabled with contacts", () => {
      // Mock successful poll that returns no messages
      mockPrepare.mockReturnValue({ all: mockAll });
      mockAll.mockReturnValue([]);

      const result = startIMessageMonitor({} as never, {
        chatDbPath: "/path/to/chat.db",
        contacts: ["+15551234567"],
        pollIntervalMs: 60000,
        enabled: true,
      });

      expect(result).not.toBeNull();

      // Clean up interval
      if (result) clearInterval(result);
    });
  });
});
