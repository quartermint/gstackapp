//
//  SandboxExecutor.swift
//  MissionControl
//
//  Isolated task execution with command allowlist and sandbox enforcement.
//

import Foundation

/// Sandbox executor for isolated task execution
class SandboxExecutor {
    static let shared = SandboxExecutor()

    // Command allowlist - mirrors the compute package allowlist
    private let allowedCommands: Set<String> = [
        // Git operations
        "git",
        // Package managers
        "npm", "pnpm", "yarn", "npx",
        // Basic file operations (read-only preferred)
        "ls", "cat", "head", "tail", "wc", "find", "grep",
        // Development tools
        "node", "python3", "python",
        // Build tools
        "make", "cargo", "go",
        // Utilities
        "echo", "date", "pwd", "which", "env"
    ]

    // Blocked patterns in arguments
    private let blockedPatterns: [String] = [
        "rm -rf /",
        "rm -rf ~",
        "sudo",
        "chmod 777",
        "curl | sh",
        "wget | sh",
        "eval",
        "> /dev/",
        "mkfs",
        "dd if=",
        ":(){:|:&};:",  // Fork bomb
        "/etc/passwd",
        "/etc/shadow",
        "~/.ssh",
        ".bash_history"
    ]

    // Configuration
    var timeoutSeconds: TimeInterval = 300.0
    var maxOutputSize: Int = 1024 * 1024  // 1MB

    private var sandboxDirectory: URL?

    private init() {
        setupSandboxDirectory()
    }

    // MARK: - Setup

    private func setupSandboxDirectory() {
        let tempDir = FileManager.default.temporaryDirectory
        let sandboxPath = tempDir.appendingPathComponent("mission-control-sandbox")

        do {
            try FileManager.default.createDirectory(
                at: sandboxPath,
                withIntermediateDirectories: true,
                attributes: nil
            )
            sandboxDirectory = sandboxPath
        } catch {
            print("Failed to create sandbox directory: \(error)")
        }
    }

    // MARK: - Execution

    /// Execute a task in the sandbox
    func execute(task: TaskItem) async throws -> String {
        // Parse the task payload
        guard let payload = parseTaskPayload(task.payload) else {
            throw SandboxError.invalidPayload
        }

        // Validate the command
        try validateCommand(payload.command, arguments: payload.arguments)

        // Create isolated working directory
        let workDir = try createTaskDirectory(taskId: task.id)
        defer {
            cleanupTaskDirectory(workDir)
        }

        // Execute with timeout
        return try await withThrowingTaskGroup(of: String.self) { group in
            group.addTask {
                try await self.runProcess(
                    command: payload.command,
                    arguments: payload.arguments,
                    workingDirectory: workDir
                )
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(self.timeoutSeconds * 1_000_000_000))
                throw SandboxError.timeout
            }

            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    // MARK: - Command Validation

    private func validateCommand(_ command: String, arguments: [String]) throws {
        // Check if command is in allowlist
        let baseName = (command as NSString).lastPathComponent
        guard allowedCommands.contains(baseName) else {
            throw SandboxError.commandNotAllowed(command)
        }

        // Check for blocked patterns in arguments
        let fullCommand = "\(command) \(arguments.joined(separator: " "))"
        for pattern in blockedPatterns {
            if fullCommand.lowercased().contains(pattern.lowercased()) {
                throw SandboxError.blockedPattern(pattern)
            }
        }

        // Additional validation for specific commands
        switch baseName {
        case "rm":
            // Only allow rm with specific safe flags
            if arguments.contains("-rf") || arguments.contains("-fr") {
                if arguments.contains("/") || arguments.contains("~") || arguments.contains("..") {
                    throw SandboxError.dangerousArguments("rm with dangerous path")
                }
            }

        case "git":
            // Block potentially dangerous git operations
            let dangerousGitCommands = ["push --force", "reset --hard", "clean -fd"]
            for dangerous in dangerousGitCommands {
                if fullCommand.contains(dangerous) {
                    throw SandboxError.dangerousArguments("git \(dangerous)")
                }
            }

        default:
            break
        }
    }

    // MARK: - Process Execution

    private func runProcess(command: String, arguments: [String], workingDirectory: URL) async throws -> String {
        let process = Process()
        let outputPipe = Pipe()
        let errorPipe = Pipe()

        // Find the command path
        let commandPath = try findCommandPath(command)

        process.executableURL = URL(fileURLWithPath: commandPath)
        process.arguments = arguments
        process.currentDirectoryURL = workingDirectory
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        // Set restricted environment
        process.environment = restrictedEnvironment(workingDirectory: workingDirectory)

        // Run the process
        try process.run()

        // Wait for completion
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global().async {
                process.waitUntilExit()

                let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
                let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()

                let output = String(data: outputData, encoding: .utf8) ?? ""
                let errorOutput = String(data: errorData, encoding: .utf8) ?? ""

                if process.terminationStatus == 0 {
                    // Truncate if too large
                    let truncatedOutput = output.count > self.maxOutputSize
                        ? String(output.prefix(self.maxOutputSize)) + "\n...[truncated]"
                        : output

                    continuation.resume(returning: truncatedOutput)
                } else {
                    let error = SandboxError.executionFailed(
                        code: Int(process.terminationStatus),
                        message: errorOutput.isEmpty ? output : errorOutput
                    )
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func findCommandPath(_ command: String) throws -> String {
        // If already a path, validate it
        if command.hasPrefix("/") {
            if FileManager.default.isExecutableFile(atPath: command) {
                return command
            }
            throw SandboxError.commandNotFound(command)
        }

        // Search in safe paths only
        let safePaths = [
            "/usr/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/bin"
        ]

        for path in safePaths {
            let fullPath = "\(path)/\(command)"
            if FileManager.default.isExecutableFile(atPath: fullPath) {
                return fullPath
            }
        }

        throw SandboxError.commandNotFound(command)
    }

    private func restrictedEnvironment(workingDirectory: URL) -> [String: String] {
        var env: [String: String] = [:]

        // Safe PATH
        env["PATH"] = "/usr/bin:/usr/local/bin:/opt/homebrew/bin:/bin"

        // Working directory
        env["HOME"] = workingDirectory.path
        env["TMPDIR"] = workingDirectory.path

        // Disable potentially dangerous features
        env["SHELL"] = "/bin/false"
        env["TERM"] = "dumb"

        // Copy some safe env vars
        if let lang = ProcessInfo.processInfo.environment["LANG"] {
            env["LANG"] = lang
        }

        return env
    }

    // MARK: - Directory Management

    private func createTaskDirectory(taskId: String) throws -> URL {
        guard let sandbox = sandboxDirectory else {
            throw SandboxError.sandboxNotInitialized
        }

        let taskDir = sandbox.appendingPathComponent("task-\(taskId)-\(UUID().uuidString)")

        try FileManager.default.createDirectory(
            at: taskDir,
            withIntermediateDirectories: true,
            attributes: nil
        )

        return taskDir
    }

    private func cleanupTaskDirectory(_ directory: URL) {
        try? FileManager.default.removeItem(at: directory)
    }

    // MARK: - Payload Parsing

    struct TaskPayload {
        let command: String
        let arguments: [String]
    }

    private func parseTaskPayload(_ payload: String) -> TaskPayload? {
        // Try JSON format first
        if let data = payload.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let command = json["command"] as? String {
                let arguments = json["arguments"] as? [String] ?? []
                return TaskPayload(command: command, arguments: arguments)
            }
        }

        // Fall back to shell-style parsing
        let components = payload.split(separator: " ", omittingEmptySubsequences: true)
        guard let first = components.first else { return nil }

        return TaskPayload(
            command: String(first),
            arguments: components.dropFirst().map(String.init)
        )
    }
}

// MARK: - Errors

enum SandboxError: Error, LocalizedError {
    case invalidPayload
    case commandNotAllowed(String)
    case commandNotFound(String)
    case blockedPattern(String)
    case dangerousArguments(String)
    case sandboxNotInitialized
    case timeout
    case executionFailed(code: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidPayload:
            return "Invalid task payload"
        case .commandNotAllowed(let cmd):
            return "Command not in allowlist: \(cmd)"
        case .commandNotFound(let cmd):
            return "Command not found: \(cmd)"
        case .blockedPattern(let pattern):
            return "Blocked pattern detected: \(pattern)"
        case .dangerousArguments(let desc):
            return "Dangerous arguments: \(desc)"
        case .sandboxNotInitialized:
            return "Sandbox directory not initialized"
        case .timeout:
            return "Task execution timed out"
        case .executionFailed(let code, let message):
            return "Execution failed (exit \(code)): \(message)"
        }
    }
}
