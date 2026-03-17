import { describe, it, expect, vi } from "vitest";

vi.mock("../api-client.js", () => ({
  listProjects: vi.fn(),
  McApiUnreachable: class McApiUnreachable extends Error {
    constructor() {
      super("unreachable");
      this.name = "McApiUnreachable";
    }
  },
}));

import { listProjects, McApiUnreachable } from "../api-client.js";
import { detectProjectFromCwd } from "../project-detect.js";

const mockListProjects = vi.mocked(listProjects);

describe("detectProjectFromCwd", () => {
  it("returns slug when cwd matches project path", async () => {
    mockListProjects.mockResolvedValue({
      projects: [
        {
          slug: "mission-control",
          name: "Mission Control",
          path: "/Users/ryan/mission-control",
          host: "local",
          lastCommitTime: null,
          lastCommitDate: null,
          lastCommitMessage: null,
          healthScore: null,
          riskLevel: "healthy",
        },
      ],
    });

    const slug = await detectProjectFromCwd("/Users/ryan/mission-control");
    expect(slug).toBe("mission-control");
  });

  it("returns slug when cwd is subdirectory of project", async () => {
    mockListProjects.mockResolvedValue({
      projects: [
        {
          slug: "mission-control",
          name: "Mission Control",
          path: "/Users/ryan/mission-control",
          host: "local",
          lastCommitTime: null,
          lastCommitDate: null,
          lastCommitMessage: null,
          healthScore: null,
          riskLevel: "healthy",
        },
      ],
    });

    const slug = await detectProjectFromCwd("/Users/ryan/mission-control/packages/cli");
    expect(slug).toBe("mission-control");
  });

  it("returns longest match when multiple projects match", async () => {
    mockListProjects.mockResolvedValue({
      projects: [
        {
          slug: "parent",
          name: "Parent",
          path: "/Users/ryan",
          host: "local",
          lastCommitTime: null,
          lastCommitDate: null,
          lastCommitMessage: null,
          healthScore: null,
          riskLevel: "healthy",
        },
        {
          slug: "child",
          name: "Child",
          path: "/Users/ryan/child-project",
          host: "local",
          lastCommitTime: null,
          lastCommitDate: null,
          lastCommitMessage: null,
          healthScore: null,
          riskLevel: "healthy",
        },
      ],
    });

    const slug = await detectProjectFromCwd("/Users/ryan/child-project/src");
    expect(slug).toBe("child");
  });

  it("returns null when no project matches", async () => {
    mockListProjects.mockResolvedValue({
      projects: [
        {
          slug: "other",
          name: "Other",
          path: "/somewhere/else",
          host: "local",
          lastCommitTime: null,
          lastCommitDate: null,
          lastCommitMessage: null,
          healthScore: null,
          riskLevel: "healthy",
        },
      ],
    });

    const slug = await detectProjectFromCwd("/Users/ryan/untracked");
    expect(slug).toBeNull();
  });

  it("returns null when API is unreachable", async () => {
    mockListProjects.mockRejectedValue(new McApiUnreachable());
    const slug = await detectProjectFromCwd("/Users/ryan/mission-control");
    expect(slug).toBeNull();
  });
});
