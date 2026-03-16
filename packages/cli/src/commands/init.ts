import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { loadConfig, saveConfig, getDefaultApiUrl, getConfigPath } from "../config.js";
import { checkHealth } from "../api-client.js";
import { success, error, info, warn, colors } from "../output.js";

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${colors.dim(`(${defaultValue})`)}` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || defaultValue || "";
}

export const initCommand = new Command("init")
  .description("Configure Mission Control CLI")
  .option("--url <url>", "Set API URL directly (skip interactive)")
  .action(async (opts: { url?: string }) => {
    try {
      info(colors.bold("Mission Control CLI Setup"));
      info("");

      const existing = loadConfig();
      if (existing) {
        info(`  Current config: ${colors.dim(getConfigPath())}`);
        info(`  API URL: ${existing.apiUrl}`);
        info("");
      }

      // Determine API URL
      let apiUrl: string;
      if (opts.url) {
        apiUrl = opts.url;
      } else {
        const defaultUrl = existing?.apiUrl ?? getDefaultApiUrl();
        info(`  Default URL: ${getDefaultApiUrl()}`);
        info(`  ${colors.dim("(Mac Mini via Tailscale at 100.123.8.125:3000)")}`);
        info("");
        apiUrl = await prompt("  API URL", defaultUrl);
      }

      // Normalize URL: remove trailing slash
      apiUrl = apiUrl.replace(/\/+$/, "");

      // Validate URL format
      try {
        new URL(apiUrl);
      } catch {
        error(`Invalid URL: ${apiUrl}`);
        process.exit(1);
      }

      // Test connection
      info("");
      info(`  Testing connection to ${apiUrl}...`);

      // Temporarily save to test (checkHealth uses getApiUrl which reads config)
      saveConfig({ apiUrl });

      const healthy = await checkHealth();
      if (healthy) {
        success(`Connected to Mission Control at ${apiUrl}`);
        info(`  Config saved to ${colors.dim(getConfigPath())}`);
        info("");
        info(`  Try: ${colors.bold("mc status")}`);
      } else {
        saveConfig({ apiUrl }); // Save anyway -- might come online later
        warn(`Saved ${apiUrl} but could not connect. Is Mission Control running?`);
        info(`  Config saved to ${colors.dim(getConfigPath())}`);
        info(`  ${colors.dim("The CLI will queue captures offline until the API is reachable.")}`);
      }

      info("");
      process.exit(0);
    } catch (e) {
      if (e instanceof Error) {
        error(e.message);
      }
      process.exit(1);
    }
  });
