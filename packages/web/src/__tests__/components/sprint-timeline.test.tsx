import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SprintTimeline } from "../../components/sprint-timeline/sprint-timeline.js";

// ── Mock Data ───────────────────────────────────────────────────────

const now = new Date();
const windowStart = new Date(now);
windowStart.setDate(windowStart.getDate() - 83);

function dateStr(daysAgo: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const MOCK_TIMELINE = {
  projects: [
    {
      slug: "mission-control",
      segments: [
        {
          startDate: dateStr(5),
          endDate: dateStr(1),
          commits: 42,
          density: 0.9,
        },
      ],
      totalCommits: 42,
    },
    {
      slug: "open-efb",
      segments: [
        {
          startDate: dateStr(60),
          endDate: dateStr(45),
          commits: 30,
          density: 0.7,
        },
        {
          startDate: dateStr(30),
          endDate: dateStr(20),
          commits: 15,
          density: 0.4,
        },
      ],
      totalCommits: 45,
    },
    {
      slug: "nexus-claw",
      segments: [
        {
          startDate: dateStr(70),
          endDate: dateStr(65),
          commits: 10,
          density: 0.3,
        },
      ],
      totalCommits: 10,
    },
  ],
  focusedProject: "mission-control",
  windowDays: 84,
};

const EMPTY_TIMELINE = {
  projects: [],
  focusedProject: null,
  windowDays: 84,
};

// ── Mock the hook ───────────────────────────────────────────────────

let mockData: typeof MOCK_TIMELINE | null = MOCK_TIMELINE;
let mockLoading = false;

vi.mock("../../hooks/use-sprint-timeline.js", () => ({
  useSprintTimeline: () => ({
    data: mockData,
    loading: mockLoading,
    refetch: vi.fn(),
  }),
}));

// ── Tests ───────────────────────────────────────────────────────────

describe("SprintTimeline", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockData = MOCK_TIMELINE;
    mockLoading = false;
  });

  it("renders project labels from slugs as Title Case names", () => {
    render(<SprintTimeline onSelect={onSelect} />);
    expect(screen.getByText("Mission Control")).toBeDefined();
    expect(screen.getByText("Open Efb")).toBeDefined();
    expect(screen.getByText("Nexus Claw")).toBeDefined();
  });

  it("focused project gets full saturation styling", () => {
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    const swimlanes = container.querySelectorAll("[data-testid^='swimlane-']");
    const focusedLane = container.querySelector(
      "[data-testid='swimlane-mission-control']"
    );
    expect(focusedLane).not.toBeNull();
    expect(focusedLane?.getAttribute("data-focused")).toBe("true");
  });

  it("non-focused projects are visually muted", () => {
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    const mutedLane = container.querySelector(
      "[data-testid='swimlane-open-efb']"
    );
    expect(mutedLane).not.toBeNull();
    expect(mutedLane?.getAttribute("data-focused")).toBe("false");
  });

  it("clicking a segment calls onSelect with the project slug", () => {
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    const segments = container.querySelectorAll("[data-testid^='segment-']");
    expect(segments.length).toBeGreaterThan(0);
    fireEvent.click(segments[0]!);
    expect(onSelect).toHaveBeenCalledWith("mission-control");
  });

  it("empty data returns null (no rendered output)", () => {
    mockData = EMPTY_TIMELINE;
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders correct number of swimlane rows (up to 10)", () => {
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    const swimlanes = container.querySelectorAll("[data-testid^='swimlane-']");
    expect(swimlanes.length).toBe(3);
  });

  it("renders loading skeleton when loading", () => {
    mockLoading = true;
    const { container } = render(<SprintTimeline onSelect={onSelect} />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
