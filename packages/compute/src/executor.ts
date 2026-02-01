import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { TaskDispatch, TaskResult } from '@mission-control/shared';
import { ERROR_CODES } from '@mission-control/shared';
import {
  validateCommand,
  validateWorkingDir,
  createSandboxEnv,
  getSandboxConfig,
  SandboxError,
} from './sandbox.js';

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Node ID for this compute node */
  nodeId: string;
  /** Maximum output size in bytes */
  maxOutputSize?: number;
}

/**
 * Execute a task in a sandboxed environment
 * @param task - The task dispatch request
 * @param config - Executor configuration
 * @returns Task result
 */
export async function executeTask(
  task: TaskDispatch,
  config: ExecutorConfig
): Promise<TaskResult> {
  const startTime = Date.now();
  const sandboxConfig = getSandboxConfig();
  const maxOutputSize = config.maxOutputSize ?? 100_000;

  // Determine working directory
  const workingDir = task.workingDir
    ? path.resolve(sandboxConfig.workDir, task.workingDir)
    : sandboxConfig.workDir;

  try {
    // Validate command is in allowlist
    validateCommand(task.command);

    // Validate working directory is within sandbox
    validateWorkingDir(workingDir, sandboxConfig);

    // Ensure working directory exists
    if (!fs.existsSync(workingDir)) {
      fs.mkdirSync(workingDir, { recursive: true });
    }

    // Create sandbox environment
    const env = createSandboxEnv(task.env);

    // Execute the command
    const result = await executeCommand(task.command, {
      cwd: workingDir,
      env,
      timeoutMs: task.timeoutMs,
      maxOutputSize,
    });

    return {
      taskId: task.taskId,
      requestId: task.requestId,
      nodeId: config.nodeId,
      status: result.exitCode === 0 ? 'completed' : 'failed',
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    if (error instanceof SandboxError) {
      return {
        taskId: task.taskId,
        requestId: task.requestId,
        nodeId: config.nodeId,
        status: 'failed',
        errorMessage: error.message,
        executionTimeMs,
      };
    }

    if (error instanceof TimeoutError) {
      return {
        taskId: task.taskId,
        requestId: task.requestId,
        nodeId: config.nodeId,
        status: 'failed',
        errorMessage: `Task timed out after ${task.timeoutMs}ms`,
        executionTimeMs,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      taskId: task.taskId,
      requestId: task.requestId,
      nodeId: config.nodeId,
      status: 'failed',
      errorMessage: `Execution error: ${errorMessage}`,
      executionTimeMs,
    };
  }
}

/**
 * Timeout error for command execution
 */
class TimeoutError extends Error {
  readonly code = ERROR_CODES.EXECUTION_TIMEOUT;

  constructor(timeoutMs: number) {
    super(`Command timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Command execution options
 */
interface CommandOptions {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  maxOutputSize: number;
}

/**
 * Command execution result
 */
interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command with timeout
 * @param command - The command to execute
 * @param options - Execution options
 * @returns Command result
 */
async function executeCommand(
  command: string,
  options: CommandOptions
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Parse command into executable and arguments
    // Using shell execution for proper parsing of complex commands
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
      reject(new TimeoutError(options.timeoutMs));
    }, options.timeoutMs);

    // Capture stdout with size limit
    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < options.maxOutputSize) {
        stdout += data.toString();
        if (stdout.length > options.maxOutputSize) {
          stdout = stdout.slice(0, options.maxOutputSize) + '\n[output truncated]';
        }
      }
    });

    // Capture stderr with size limit
    child.stderr.on('data', (data: Buffer) => {
      if (stderr.length < options.maxOutputSize) {
        stderr += data.toString();
        if (stderr.length > options.maxOutputSize) {
          stderr = stderr.slice(0, options.maxOutputSize) + '\n[output truncated]';
        }
      }
    });

    // Handle process completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (!killed) {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      }
    });

    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      if (!killed) {
        reject(error);
      }
    });
  });
}