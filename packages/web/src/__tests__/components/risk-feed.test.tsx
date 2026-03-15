import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RiskFeed } from "../../components/risk-feed/risk-feed.js";
import type { RisksResponse, RiskFinding } from "../../hooks/use-risks.js";

function makeFinding(overrides: Partial<RiskFinding> = {}): RiskFinding {
  return {
    id: 1,
    projectSlug: "test-project",
    checkType: "unpushed_commits",
    severity: "warning",
    detail: "3 commits not pushed",
    metadata: { branch: "main" },
    detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    resolvedAt: null,
    isNew: false,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<RisksResponse> = {}): RisksResponse {
  return {
    critical: [],
    warning: [],
    riskCount: 0,
    summary: "All projects healthy",
    ...overrides,
  };
}

const writeTextMock = vi.fn().mockResolvedValue(undefined);

describe("RiskFeed", () => {
  beforeEach(() => {
    writeTextMock.mockClear();
    // Mock clipboard API on navigator
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
  });

  it("renders 'All projects healthy' when riskCount is 0", () => {
    const data = makeResponse({ riskCount: 0 });
    render(<RiskFeed data={data} loading={false} />);
    expect(screen.getByText("All projects healthy")).toBeDefined();
  });

  it("returns null when loading", () => {
    const { container } = render(<RiskFeed data={null} loading={true} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders critical findings before warning findings", () => {
    const criticalFinding = makeFinding({
      id: 1,
      severity: "critical",
      projectSlug: "critical-project",
      detail: "No remote configured",
      checkType: "no_remote",
    });
    const warningFinding = makeFinding({
      id: 2,
      severity: "warning",
      projectSlug: "warning-project",
      detail: "3 commits not pushed",
    });
    const data = makeResponse({
      critical: [criticalFinding],
      warning: [warningFinding],
      riskCount: 2,
      summary: "2 risks found",
    });

    render(<RiskFeed data={data} loading={false} />);

    const projectNames = screen.getAllByTestId("risk-project-name");
    expect(projectNames).toHaveLength(2);
    expect(projectNames[0]!.textContent).toBe("critical-project");
    expect(projectNames[1]!.textContent).toBe("warning-project");
  });

  it("each card shows project name, detail text, and duration", () => {
    const finding = makeFinding({
      projectSlug: "my-app",
      detail: "5 commits not pushed",
      detectedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    expect(screen.getByText("my-app")).toBeDefined();
    expect(screen.getByText("5 commits not pushed")).toBeDefined();
    // Duration text should contain "hour"
    expect(screen.getByTestId("risk-duration").textContent).toMatch(/hour/i);
  });

  it("shows 'new' badge for findings with isNew=true", () => {
    const finding = makeFinding({ isNew: true });
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    expect(screen.getByText("new")).toBeDefined();
  });

  it("does not show 'new' badge for findings with isNew=false", () => {
    const finding = makeFinding({ isNew: false });
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    expect(screen.queryByText("new")).toBeNull();
  });

  it("has no dismiss or close button", () => {
    const finding = makeFinding();
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    expect(screen.queryByText(/dismiss/i)).toBeNull();
  });

  it("action hint button renders with correct git command text", () => {
    const finding = makeFinding({
      checkType: "unpushed_commits",
      metadata: { branch: "develop" },
    });
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    expect(screen.getByText("git push origin develop")).toBeDefined();
  });

  it("clicking action hint copies command to clipboard", async () => {
    vi.useFakeTimers();
    const finding = makeFinding({
      checkType: "unpushed_commits",
      metadata: { branch: "main" },
    });
    const data = makeResponse({
      warning: [finding],
      riskCount: 1,
      summary: "1 risk",
    });

    render(<RiskFeed data={data} loading={false} />);
    const actionBtn = screen.getByText("git push origin main");
    const { fireEvent, act } = await import("@testing-library/react");
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      fireEvent.click(actionBtn);
      // Flush microtasks (clipboard.writeText promise)
      await Promise.resolve();
    });
    expect(writeTextMock).toHaveBeenCalledWith("git push origin main");
    // Advance timers to clear the "Copied!" setTimeout
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();
  });
});
