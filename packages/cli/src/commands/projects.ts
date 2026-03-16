import { Command } from "commander";
import { listProjects, McApiUnreachable } from "../api-client.js";
import { error, table, relativeTime, colors } from "../output.js";

function healthIndicator(riskLevel: string): string {
  switch (riskLevel) {
    case "healthy":
      return colors.green("\u2713");
    case "warning":
      return colors.yellow("\u26A0");
    case "critical":
      return colors.red("\u2717");
    default:
      return colors.dim("\u00B7");
  }
}

function activityStatus(lastCommitDate: string | null): string {
  if (!lastCommitDate) return colors.dim("stale");
  const days = (Date.now() - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return colors.green("active");
  if (days <= 30) return colors.yellow("idle");
  return colors.dim("stale");
}

export const projectsCommand = new Command("projects")
  .description("List all tracked projects")
  .action(async () => {
    try {
      const { projects } = await listProjects();

      if (projects.length === 0) {
        error("No projects tracked. Check mc.config.json on the API server.");
        process.exit(1);
      }

      // Sort: active first, then idle, then stale
      const sorted = [...projects].sort((a, b) => {
        const aDate = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
        const bDate = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
        return bDate - aDate; // Most recent first
      });

      const headers = ["", "Project", "Status", "Last Commit", "Host"];
      const rows = sorted.map((p) => [
        healthIndicator(p.riskLevel),
        p.name,
        activityStatus(p.lastCommitDate),
        relativeTime(p.lastCommitDate),
        colors.dim(p.host),
      ]);

      table(headers, rows);
      process.exit(0);
    } catch (e) {
      if (e instanceof McApiUnreachable) {
        error("Cannot reach Mission Control API. Run mc init to configure.");
        process.exit(1);
      }
      if (e instanceof Error) {
        error(e.message);
      }
      process.exit(1);
    }
  });
