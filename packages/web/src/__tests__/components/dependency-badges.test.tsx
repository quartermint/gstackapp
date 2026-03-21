import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

describe("DependencyBadges", () => {
  let DependencyBadges: typeof import("../../components/ui/dependency-badges.js").DependencyBadges;

  beforeEach(async () => {
    const mod = await import("../../components/ui/dependency-badges.js");
    DependencyBadges = mod.DependencyBadges;
  });

  it("renders nothing when dependsOn is empty", () => {
    const { container } = render(<DependencyBadges dependsOn={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders one pill badge for a single dependency", () => {
    render(<DependencyBadges dependsOn={["nexusclaw"]} />);
    expect(screen.getByText("nexusclaw")).toBeDefined();
  });

  it("renders pill badges for 2 dependencies", () => {
    render(<DependencyBadges dependsOn={["nexusclaw", "openefb"]} />);
    expect(screen.getByText("nexusclaw")).toBeDefined();
    expect(screen.getByText("openefb")).toBeDefined();
  });

  it("renders pill badges for exactly 3 dependencies without collapse", () => {
    render(
      <DependencyBadges dependsOn={["nexusclaw", "openefb", "taxnav"]} />
    );
    expect(screen.getByText("nexusclaw")).toBeDefined();
    expect(screen.getByText("openefb")).toBeDefined();
    expect(screen.getByText("taxnav")).toBeDefined();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("collapses to first 3 plus '+1 more' for 4 dependencies", () => {
    render(
      <DependencyBadges
        dependsOn={["nexusclaw", "openefb", "taxnav", "streamline"]}
      />
    );
    expect(screen.getByText("nexusclaw")).toBeDefined();
    expect(screen.getByText("openefb")).toBeDefined();
    expect(screen.getByText("taxnav")).toBeDefined();
    expect(screen.queryByText("streamline")).toBeNull();
    expect(screen.getByText("+1 more")).toBeDefined();
  });

  it("collapses to first 3 plus '+3 more' for 6 dependencies", () => {
    render(
      <DependencyBadges
        dependsOn={["a", "b", "c", "d", "e", "f"]}
      />
    );
    expect(screen.getByText("a")).toBeDefined();
    expect(screen.getByText("b")).toBeDefined();
    expect(screen.getByText("c")).toBeDefined();
    expect(screen.queryByText("d")).toBeNull();
    expect(screen.queryByText("e")).toBeNull();
    expect(screen.queryByText("f")).toBeNull();
    expect(screen.getByText("+3 more")).toBeDefined();
  });

  it("uses neutral bg-warm-gray/8 styling (not health-coded)", () => {
    const { container } = render(
      <DependencyBadges dependsOn={["nexusclaw"]} />
    );
    const pill = container.querySelector("span span");
    expect(pill).toBeDefined();
    expect(pill!.className).toContain("bg-warm-gray/8");
    expect(pill!.className).toContain("text-[10px]");
    expect(pill!.className).toContain("rounded-full");
    expect(pill!.className).toContain("font-medium");
  });

  it("uses text-[10px] font-medium rounded-full px-2 py-0.5 matching HostBadge", () => {
    const { container } = render(
      <DependencyBadges dependsOn={["openefb"]} />
    );
    const pill = container.querySelector("span span");
    expect(pill!.className).toContain("px-2");
    expect(pill!.className).toContain("py-0.5");
  });
});
