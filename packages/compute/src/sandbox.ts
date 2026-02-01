import * as path from 'node:path';
import { ERROR_CODES } from '@mission-control/shared';

/**
 * Allowlist of commands that can be executed in the sandbox
 */
export const COMMAND_ALLOWLIST = [
  'git',
  'npm',
  'pnpm',
  'node',
  'npx',
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'grep',
  'echo',
  'pwd',
  'mkdir',
  'cp',
  'mv',
  'rm',
] as const;

export type AllowedCommand = (typeof COMMAND_ALLOWLIST)[number];

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Base directory for sandbox operations */
  workDir: string;
  /** Whether sandbox is enabled */
  enabled: boolean;
}

/**
 * Sandbox error with code
 */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Check if a command is in the allowlist
 * @param command - The command string to check
 * @returns true if the command is allowed
 */
export function isCommandAllowed(command: string): boolean {
  // Parse the command to get the base executable
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  // Extract the first token (the command name)
  // Handle potential path prefixes like /usr/bin/git
  const firstToken = trimmed.split(/\s+/)[0];
  if (!firstToken) {
    return false;
  }

  // Get the base name (e.g., 'git' from '/usr/bin/git')
  const baseName = path.basename(firstToken);

  // Check if the base command is in the allowlist
  return COMMAND_ALLOWLIST.includes(baseName as AllowedCommand);
}

/**
 * Validate that a working directory is within the sandbox
 * @param workingDir - The directory to validate
 * @param sandboxConfig - Sandbox configuration
 * @throws SandboxError if the directory is outside the sandbox
 */
export function validateWorkingDir(
  workingDir: string,
  sandboxConfig: SandboxConfig
): void {
  if (!sandboxConfig.enabled) {
    return;
  }

  const resolvedWorkDir = path.resolve(workingDir);
  const resolvedSandboxDir = path.resolve(sandboxConfig.workDir);

  // Check if the working directory is within the sandbox
  if (!resolvedWorkDir.startsWith(resolvedSandboxDir + path.sep) &&
      resolvedWorkDir !== resolvedSandboxDir) {
    throw new SandboxError(
      `Working directory "${workingDir}" is outside sandbox "${sandboxConfig.workDir}"`,
      ERROR_CODES.SANDBOX_VIOLATION
    );
  }
}

/**
 * Validate a command against sandbox rules
 * @param command - The command to validate
 * @throws SandboxError if the command is not allowed
 */
export function validateCommand(command: string): void {
  if (!isCommandAllowed(command)) {
    const firstToken = command.trim().split(/\s+/)[0] ?? '';
    const baseName = path.basename(firstToken);
    throw new SandboxError(
      `Command "${baseName}" is not in the allowlist. Allowed commands: ${COMMAND_ALLOWLIST.join(', ')}`,
      ERROR_CODES.COMMAND_NOT_ALLOWED
    );
  }
}

/**
 * Create a restricted environment for sandbox execution
 * @param additionalEnv - Additional environment variables to include
 * @returns Restricted environment object
 */
export function createSandboxEnv(
  additionalEnv?: Record<string, string>
): Record<string, string> {
  // Start with a minimal, safe PATH
  const safePaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/local/sbin',
    '/usr/sbin',
    '/sbin',
  ];

  // On macOS, include Homebrew paths for arm64 and x64
  if (process.platform === 'darwin') {
    safePaths.unshift('/opt/homebrew/bin'); // arm64
    safePaths.push('/usr/local/opt/node/bin'); // Common node location
  }

  const env: Record<string, string> = {
    PATH: safePaths.join(':'),
    HOME: process.env['HOME'] ?? '/tmp',
    USER: process.env['USER'] ?? 'sandbox',
    SHELL: '/bin/sh',
    LANG: 'en_US.UTF-8',
    TERM: 'xterm-256color',
    // Prevent npm/pnpm from doing unexpected things
    NO_UPDATE_NOTIFIER: '1',
    npm_config_update_notifier: 'false',
    // Node.js settings
    NODE_ENV: 'production',
  };

  // Merge additional environment variables (they can override defaults)
  if (additionalEnv) {
    // Filter out potentially dangerous environment variables
    const blockedEnvVars = [
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
      'DYLD_LIBRARY_PATH',
    ];

    for (const [key, value] of Object.entries(additionalEnv)) {
      if (!blockedEnvVars.includes(key)) {
        env[key] = value;
      }
    }
  }

  return env;
}

/**
 * Get the default sandbox configuration from environment
 */
export function getSandboxConfig(): SandboxConfig {
  const enabled = process.env['SANDBOX_ENABLED'] !== 'false';
  const workDir = process.env['SANDBOX_WORKDIR'] ?? '/tmp/mission-control/sandbox';

  return {
    enabled,
    workDir,
  };
}
