import { Command } from "commander";
import { listProjects, listSessions, McApiUnreachable } from "../api-client.js";
import { error, info, colors } from "../output.js";
import { queueCount } from "../queue.js";

export const statusCommand = new Command("status")
  .description("Show Mission Control overview")
  .action(async () => {
    try {
      const [projectsRes, sessionsRes] = await Promise.all([
        listProjects(),
        listSessions("active"),
      ]);

      const projects = projectsRes.projects;

      // Categorize projects by activity
      const now = Date.now();
      let active = 0;
      let idle = 0;
      let stale = 0;

      for (const p of projects) {
        if (!p.lastCommitDate) {
          stale++;
          continue;
        }
        const daysSinceCommit = (now - new Date(p.lastCommitDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCommit <= 7) active++;
        else if (daysSinceCommit <= 30) idle++;
        else stale++;
      }

      // Health overview
      let healthy = 0;
      let warnings = 0;
      let critical = 0;
      for (const p of projects) {
        if (p.riskLevel === "critical") critical++;
        else if (p.riskLevel === "warning") warnings++;
        else if (p.riskLevel === "healthy") healthy++;
      }

      const activeSessions = sessionsRes.sessions.length;

      // Display
      info(colors.bold("Mission Control"));
      info("");
      info(`  Projects:  ${colors.green(`${active} active`)}  ${colors.yellow(`${idle} idle`)}  ${colors.dim(`${stale} stale`)}  ${colors.dim(`(${projects.length} total)`)}`);
      info(`  Health:    ${colors.green(`${healthy} \u2713`)}  ${colors.yellow(`${warnings} \u26A0`)}  ${colors.red(`${critical} \u2717`)}`);
      info(`  Sessions:  ${activeSessions} active`);

      // Show queue count if any
      const queued = queueCount();
      if (queued > 0) {
        info(`  Queue:     ${colors.yellow(`${queued} pending`)} ${colors.dim("(will sync on next mc capture)")}`);
      }

      info("");
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
