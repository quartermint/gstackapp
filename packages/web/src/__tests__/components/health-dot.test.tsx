import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── HealthDot tests ────────────────────────────────────────────────

describe("HealthDot", () => {
  let HealthDot: typeof import("../../components/departure-board/health-dot.js").HealthDot;

  beforeEach(async () => {
    const mod = await import("../../components/departure-board/health-dot.js");
    HealthDot = mod.HealthDot;
  });

  it("renders green dot for riskLevel='healthy'", () => {
    const onClick = vi.fn();
    const { container } = render(
      <HealthDot riskLevel="healthy" hasDivergedCopies={false} onClick={onClick} />
    );
    const dot = container.querySelector("button");
    expect(dot).toBeDefined();
    expect(dot!.className).toContain("bg-sage");
  });

  it("renders amber dot for riskLevel='warning'", () => {
    const onClick = vi.fn();
    const { container } = render(
      <HealthDot riskLevel="warning" hasDivergedCopies={false} onClick={onClick} />
    );
    const dot = container.querySelector("button");
    expect(dot!.className).toContain("bg-gold-status");
  });

  it("renders red dot for riskLevel='critical'", () => {
    const onClick = vi.fn();
    const { container } = render(
      <HealthDot riskLevel="critical" hasDivergedCopies={false} onClick={onClick} />
    );
    const dot = container.querySelector("button");
    expect(dot!.className).toContain("bg-rust");
  });

  it("renders gray dot for riskLevel='unmonitored'", () => {
    const onClick = vi.fn();
    const { container } = render(
      <HealthDot riskLevel="unmonitored" hasDivergedCopies={false} onClick={onClick} />
    );
    const dot = container.querySelector("button");
    expect(dot!.className).toContain("bg-text-muted");
  });

  it("renders split dot when hasDivergedCopies=true", () => {
    const onClick = vi.fn();
    render(
      <HealthDot riskLevel="warning" hasDivergedCopies={true} onClick={onClick} />
    );
    // Split dot renders two half-circle divs
    const halves = screen.getAllByTestId("split-dot-half");
    expect(halves).toHaveLength(2);
  });

  it("clicking dot calls onClick and stops propagation", () => {
    const onClick = vi.fn();
    const parentClick = vi.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <HealthDot riskLevel="warning" hasDivergedCopies={false} onClick={onClick} />
      </div>
    );
    const dot = container.querySelector("button")!;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });
});

// ── FindingsPanel tests ────────────────────────────────────────────

// Mock the useProjectHealth hook
vi.mock("../../hooks/use-project-health.js", () => ({
  useProjectHealth: vi.fn(),
}));

describe("FindingsPanel", () => {
  let FindingsPanel: typeof import("../../components/departure-board/findings-panel.js").FindingsPanel;
  let useProjectHealthMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const hookMod = await import("../../hooks/use-project-health.js");
    useProjectHealthMock = hookMod.useProjectHealth as ReturnType<typeof vi.fn>;

    const mod = await import("../../components/departure-board/findings-panel.js");
    FindingsPanel = mod.FindingsPanel;
  });

  it("is collapsed (max-h-0) when expanded=false", () => {
    useProjectHealthMock.mockReturnValue({
      findings: [],
      riskLevel: "healthy",
      loading: false,
    });

    const { container } = render(
      <FindingsPanel slug="test-project" expanded={false} />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("max-h-0");
    expect(wrapper.className).toContain("opacity-0");
  });

  it("expands with max-h transition classes when expanded=true", () => {
    useProjectHealthMock.mockReturnValue({
      findings: [
        {
          id: 1,
          projectSlug: "test-project",
          checkType: "unpushed_commits",
          severity: "warning",
          detail: "3 commits not pushed",
          metadata: { branch: "main" },
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
          isNew: false,
        },
      ],
      riskLevel: "warning",
      loading: false,
    });

    const { container } = render(
      <FindingsPanel slug="test-project" expanded={true} />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("max-h-60");
    expect(wrapper.className).toContain("opacity-100");
  });
});
