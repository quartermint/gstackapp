//
//  ComputeService.swift
//  MissionControl
//
//  Service for compute contribution mode - task polling and result submission.
//

import Foundation
import Combine

/// Compute service for task polling and execution management
class ComputeService {
    private let apiClient: APIClient
    private let nodeId: String
    private let hostname: String

    private var pollTimer: Timer?
    private var heartbeatTimer: Timer?
    private var isPolling = false

    private var activeTasks: [String: Task<Void, Never>] = [:]

    // Configuration
    var maxConcurrentTasks: Int = 2
    var pollInterval: TimeInterval = 10.0
    var heartbeatInterval: TimeInterval = 30.0

    // Callbacks
    var onTaskReceived: ((TaskItem) -> Void)?
    var onTaskCompleted: ((String, String) -> Void)?
    var onTaskFailed: ((String, String) -> Void)?
    var onError: ((Error) -> Void)?

    init(apiClient: APIClient) {
        self.apiClient = apiClient
        self.nodeId = UUID().uuidString
        self.hostname = Host.current().localizedName ?? "mac-\(ProcessInfo.processInfo.processIdentifier)"
    }

    // MARK: - Lifecycle

    /// Start polling for tasks
    func startPolling() {
        guard !isPolling else { return }
        isPolling = true

        // Start poll timer
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.pollForTasks()
        }
        pollTimer?.fire() // Immediate first poll

        // Start heartbeat timer
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: heartbeatInterval, repeats: true) { [weak self] _ in
            self?.sendHeartbeat()
        }
        heartbeatTimer?.fire() // Immediate first heartbeat
    }

    /// Stop polling for tasks
    func stopPolling() {
        isPolling = false
        pollTimer?.invalidate()
        pollTimer = nil
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil

        // Cancel active tasks
        for (_, task) in activeTasks {
            task.cancel()
        }
        activeTasks.removeAll()
    }

    // MARK: - Task Polling

    private func pollForTasks() {
        guard isPolling else { return }
        guard activeTasks.count < maxConcurrentTasks else { return }

        Task {
            do {
                let response = try await apiClient.claimTask(nodeId: nodeId)
                if response.claimed, let task = response.task {
                    await MainActor.run {
                        onTaskReceived?(task)
                    }
                    executeTask(task)
                }
            } catch {
                await MainActor.run {
                    onError?(error)
                }
            }
        }
    }

    // MARK: - Task Execution

    private func executeTask(_ task: TaskItem) {
        let executionTask = Task { [weak self] in
            guard let self = self else { return }

            do {
                // Execute the task through sandbox executor
                let result = try await SandboxExecutor.shared.execute(task: task)

                // Submit successful result
                try await self.submitResult(
                    taskId: task.id,
                    status: "completed",
                    result: result,
                    error: nil
                )

                await MainActor.run {
                    self.onTaskCompleted?(task.id, result)
                }
            } catch {
                // Submit failed result
                try? await self.submitResult(
                    taskId: task.id,
                    status: "failed",
                    result: nil,
                    error: error.localizedDescription
                )

                await MainActor.run {
                    self.onTaskFailed?(task.id, error.localizedDescription)
                }
            }

            self.activeTasks.removeValue(forKey: task.id)
        }

        activeTasks[task.id] = executionTask
    }

    // MARK: - Result Submission

    private func submitResult(taskId: String, status: String, result: String?, error: String?) async throws {
        let payload = APIClient.TaskResultPayload(
            taskId: taskId,
            nodeId: nodeId,
            status: status,
            result: result,
            error: error
        )

        try await apiClient.submitTaskResult(payload)
    }

    // MARK: - Heartbeat

    private func sendHeartbeat() {
        Task {
            do {
                let metrics = getCurrentMetrics()
                let payload = APIClient.HeartbeatPayload(
                    nodeId: nodeId,
                    hostname: hostname,
                    status: activeTasks.isEmpty ? "online" : "busy",
                    metrics: metrics
                )

                try await apiClient.sendHeartbeat(payload)
            } catch {
                await MainActor.run {
                    onError?(error)
                }
            }
        }
    }

    private func getCurrentMetrics() -> NodeMetrics {
        // Get CPU usage
        var cpuInfo = host_cpu_load_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let result = withUnsafeMutablePointer(to: &cpuInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }

        var cpuUsage: Double = 0.0
        if result == KERN_SUCCESS {
            let userLoad = Double(cpuInfo.cpu_ticks.0)
            let systemLoad = Double(cpuInfo.cpu_ticks.1)
            let idleLoad = Double(cpuInfo.cpu_ticks.2)
            let niceLoad = Double(cpuInfo.cpu_ticks.3)
            let totalLoad = userLoad + systemLoad + idleLoad + niceLoad
            cpuUsage = totalLoad > 0 ? ((userLoad + systemLoad) / totalLoad) * 100 : 0
        }

        // Get memory usage
        var vmStats = vm_statistics64_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
        let vmResult = withUnsafeMutablePointer(to: &vmStats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &vmCount)
            }
        }

        var memoryUsage: Double = 0.0
        if vmResult == KERN_SUCCESS {
            let pageSize = UInt64(vm_kernel_page_size)
            let totalMemory = ProcessInfo.processInfo.physicalMemory
            let freeMemory = UInt64(vmStats.free_count) * pageSize
            let usedMemory = totalMemory - freeMemory
            memoryUsage = (Double(usedMemory) / Double(totalMemory)) * 100
        }

        return NodeMetrics(
            cpuUsage: cpuUsage,
            memoryUsage: memoryUsage,
            activeTasks: activeTasks.count
        )
    }

    // MARK: - Status

    var activeTaskCount: Int {
        activeTasks.count
    }

    var isActive: Bool {
        isPolling
    }
}
