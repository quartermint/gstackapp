import { Command } from "commander";
import { captureCommand } from "./commands/capture.js";
import { statusCommand } from "./commands/status.js";
import { projectsCommand } from "./commands/projects.js";
import { initCommand } from "./commands/init.js";

const program = new Command()
  .name("mc")
  .description("Mission Control CLI -- capture thoughts, check project status")
  .version("1.0.0");

program.addCommand(captureCommand);
program.addCommand(statusCommand);
program.addCommand(projectsCommand);
program.addCommand(initCommand);

program.parse();
