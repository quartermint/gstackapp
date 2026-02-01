//
//  TaskReceiver.swift
//  MissionControl
//
//  Polls Hub for available tasks and manages task assignment.
//

import Foundation
import Combine

/// Receives and manages tasks from the Hub
class TaskReceiver {
    private let computeService: ComputeService
    private let executor: SandboxExecutor

    private var isRunning = false
    private var pollTask: Task<Void, Never>?

    // Configuration
    var pollInterval: TimeInterval = 10.0
    var maxRetries: Int = 3

    // State
    private var activeTasks: [String: TaskExecution] = [:]
    private var taskQueue: [TaskItem] = []

    // Callbacks
    var onTaskStarted: ((TaskItem) -> Void)?
    var onTaskProgress: ((String, Double) -> Void)?
    var onTaskCompleted: ((String, String) -> Void)?
    var onTaskFailed: ((String, Error) -> Void)?

    struct TaskExecution {
        let task: TaskItem
        let startTime: Date
        var status: ExecutionStatus
        var retryCount: Int
    }

    enum ExecutionStatus {
        case queued
        case running
        case completed
        case failed
    }

    init(computeService: ComputeService, executor: SandboxExecutor) {
        self.computeService = computeService
        self.executor = executor
    }

    // MARK: - Lifecycle

    /// Start receiving tasks
    func start() {
        guard !isRunning else { return }
        isRunning = true

        // Set up compute service callbacks
        computeService.onTaskReceived = { [weak self] task in
            self?.handleTaskReceived(task)
        }

        computeService.onTaskCompleted = { [weak self] taskId, result in
            self?.handleTaskCompleted(taskId: taskId, result: result)
        }

        computeService.onTaskFailed = { [weak self] taskId, error in
            self?.handleTaskFailed(taskId: taskId, error: error)
        }

        print("TaskReceiver started")
    }

    /// Stop receiving tasks
    func stop() {
        guard isRunning else { return }
        isRunning = false

        pollTask?.cancel()
        pollTask = nil

        // Cancel queued tasks (not active ones - let them finish)
        taskQueue.removeAll()

        print("TaskReceiver stopped")
    }

    // MARK: - Task Handling

    private func handleTaskReceived(_ task: TaskItem) {
        // Create execution record
        let execution = TaskExecution(
            task: task,
            startTime: Date(),
            status: .running,
            retryCount: 0
        )

        activeTasks[task.id] = execution

        // Notify
        onTaskStarted?(task)

        // Execute the task
        executeTask(task)
    }

    private func executeTask(_ task: TaskItem) {
        Task {
            do {
                // Notify progress start
                await MainActor.run {
                    onTaskProgress?(task.id, 0.0)
                }

                // Execute in sandbox
                let result = try await executor.execute(task: task)

                // Notify progress complete
                await MainActor.run {
                    onTaskProgress?(task.id, 1.0)
                }

                // Mark as completed
                await MainActor.run {
                    activeTasks[task.id]?.status = .completed
                    onTaskCompleted?(task.id, result)
                }

            } catch {
                // Check for retry
                if var execution = activeTasks[task.id], execution.retryCount < maxRetries {
                    execution.retryCount += 1
                    activeTasks[task.id] = execution

                    print("Retrying task \(task.id), attempt \(execution.retryCount)")

                    // Delay before retry
                    try? await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(execution.retryCount))) * 1_000_000_000)

                    // Retry if still running
                    if isRunning {
                        executeTask(task)
                    }
                } else {
                    // Mark as failed
                    await MainActor.run {
                        activeTasks[task.id]?.status = .failed
                        onTaskFailed?(task.id, error)
                    }
                }
            }
        }
    }

    private func handleTaskCompleted(taskId: String, result: String) {
        activeTasks.removeValue(forKey: taskId)

        // Process next queued task if any
        processQueue()
    }

    private func handleTaskFailed(taskId: String, error: String) {
        activeTasks.removeValue(forKey: taskId)

        // Process next queued task if any
        processQueue()
    }

    // MARK: - Queue Management

    /// Add a task to the queue
    func queueTask(_ task: TaskItem) {
        taskQueue.append(task)
        processQueue()
    }

    private func processQueue() {
        guard isRunning else { return }
        guard !taskQueue.isEmpty else { return }

        // Check if we can execute more tasks
        let maxConcurrent = UserDefaults.standard.integer(forKey: "maxConcurrentTasks")
        let currentActive = activeTasks.values.filter { $0.status == .running }.count

        if currentActive < max(1, maxConcurrent) {
            let task = taskQueue.removeFirst()
            handleTaskReceived(task)
        }
    }

    // MARK: - Status

    /// Get current execution status
    var status: ReceiverStatus {
        ReceiverStatus(
            isRunning: isRunning,
            activeTaskCount: activeTasks.count,
            queuedTaskCount: taskQueue.count,
            activeTasks: Array(activeTasks.values)
        )
    }

    struct ReceiverStatus {
        let isRunning: Bool
        let activeTaskCount: Int
        let queuedTaskCount: Int
        let activeTasks: [TaskExecution]
    }

    /// Get execution for a specific task
    func getExecution(taskId: String) -> TaskExecution? {
        return activeTasks[taskId]
    }

    /// Cancel a specific task
    func cancelTask(taskId: String) {
        // Remove from queue if queued
        taskQueue.removeAll { $0.id == taskId }

        // Mark as failed if active
        if var execution = activeTasks[taskId] {
            execution.status = .failed
            activeTasks[taskId] = execution
            onTaskFailed?(taskId, CancellationError())
        }
    }

    /// Cancel all tasks
    func cancelAllTasks() {
        taskQueue.removeAll()

        for (taskId, _) in activeTasks {
            cancelTask(taskId: taskId)
        }
    }
}

// MARK: - CancellationError

struct CancellationError: Error, LocalizedError {
    var errorDescription: String? {
        return "Task was cancelled"
    }
}
