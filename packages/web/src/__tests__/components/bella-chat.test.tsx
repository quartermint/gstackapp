import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock @ai-sdk/react before importing component
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready" as const,
    error: undefined,
    id: "bella-chat",
    setMessages: vi.fn(),
    regenerate: vi.fn(),
    stop: vi.fn(),
    resumeStream: vi.fn(),
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: vi.fn(),
    clearError: vi.fn(),
  }),
}));

// Mock ai package (TextStreamChatTransport)
vi.mock("ai", () => ({
  TextStreamChatTransport: vi.fn().mockImplementation(() => ({})),
}));

// Dynamically import after mocks
const { default: BellaChat } = await import("../../components/bella/bella-chat.js");

describe("BellaChat", () => {
  it("renders empty state with prompt suggestions", () => {
    render(<BellaChat />);
    expect(screen.getByText("Hey! Ask me anything.")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Ask about projects, captures, or sessions...")
    ).toBeDefined();
  });

  it("renders Mission Control branding and Bella badge", () => {
    render(<BellaChat />);
    expect(screen.getByText("Mission Control")).toBeDefined();
    expect(screen.getByText("Bella")).toBeDefined();
  });

  it("renders API Explorer toggle", () => {
    render(<BellaChat />);
    expect(screen.getByText("API Explorer")).toBeDefined();
  });

  it("renders Dashboard link for navigation", () => {
    render(<BellaChat />);
    expect(screen.getByText("Dashboard")).toBeDefined();
  });
});
