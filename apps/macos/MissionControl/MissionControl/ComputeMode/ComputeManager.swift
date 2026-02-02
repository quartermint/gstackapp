//
//  ComputeManager.swift
//  MissionControl
//
//  Compute contribution orchestration - manages the overall compute mode lifecycle.
//

import Foundation
import Combine

/// Manages compute contribution mode
class ComputeManager: ObservableObject {
    // Published state
    @Published private(set) var isEnabled: Bool = false
    @Published private(set) var activeTasks: Int = 0
    @Published private(set) var tasksCompleted: Int = 0
    @Published private(set) var tasksFailed: Int = 0
    @Published private(set) var uptime: TimeInterval = 0
    @Published private(set) var currentStatus: ComputeStatus = .idle

    // Services
    private var computeService: ComputeService?
    private var taskReceiver: TaskReceiver?
    private let sandboxExecutor = SandboxExecutor.shared
    private let keychainService: KeychainService

    // Timers
    private var uptimeTimer: Timer?
    private var startTime: Date?

    // Configuration (loaded from UserDefaults)
    private var maxCPUPercent: Double {
        UserDefaults.standard.double(forKey: "maxCPUPercent").nonZeroOr(50.0)
    }

    private var maxMemoryMB: Double {
        UserDefaults.standard.double(forKey: "maxMemoryMB").nonZeroOr(2048.0)
    }

    private var maxConcurrentTasks: Int {
        Int(UserDefaults.standard.double(forKey: "maxConcurrentTasks").nonZeroOr(2.0))
    }

    private var taskTimeoutSeconds: TimeInterval {
        UserDefaults.standard.double(forKey: "taskTimeoutSeconds").nonZeroOr(300.0)
    }

    enum ComputeStatus: String {
        case idle = "Idle"
        case polling = "Polling for tasks"
        case executing = "Executing task"
        case paused = "Paused"
        case error = "Error"
    }

    init(keychainService: KeychainService = KeychainService()) {
        self.keychainService = keychainService
        // Load persisted state
        tasksCompleted = UserDefaults.standard.integer(forKey: "tasksCompleted")
        tasksFailed = UserDefaults.standard.integer(forKey: "tasksFailed")
    }

    // MARK: - Lifecycle

    /// Start compute contribution mode
    func start() {
        guard !isEnabled else { return }

        isEnabled = true
        startTime = Date()
        currentStatus = .polling

        // Initialize services
        let apiClient = APIClient()

        // Load auth token from keychain
        if let token = keychainService.getAuthToken() {
            apiClient.setAuthToken(token)
        }

        computeService = ComputeService(apiClient: apiClient)
        computeService?.maxConcurrentTasks = maxConcurrentTasks

        taskReceiver = TaskReceiver(
            computeService: computeService!,
            executor: sandboxExecutor
        )

        // Set up callbacks
        setupCallbacks()

        // Start services
        computeService?.startPolling()
        taskReceiver?.start()

        // Start uptime timer
        startUptimeTimer()

        // Notify status change
        NotificationCenter.default.post(
            name: NSNotification.Name("ComputeStatusChanged"),
            object: activeTasks
        )

        print("Compute mode started")
    }

    /// Stop compute contribution mode
    func stop() {
        guard isEnabled else { return }

        isEnabled = false
        currentStatus = .idle

        // Stop services
        computeService?.stopPolling()
        taskReceiver?.stop()

        // Stop uptime timer
        uptimeTimer?.invalidate()
        uptimeTimer = nil

        // Persist stats
        UserDefaults.standard.set(tasksCompleted, forKey: "tasksCompleted")
        UserDefaults.standard.set(tasksFailed, forKey: "tasksFailed")

        // Notify status change
        NotificationCenter.default.post(
            name: NSNotification.Name("ComputeStatusChanged"),
            object: 0
        )

        print("Compute mode stopped")
    }

    /// Pause compute mode (finish current tasks but don't accept new ones)
    func pause() {
        guard isEnabled else { return }

        currentStatus = .paused
        computeService?.stopPolling()
    }

    /// Resume from paused state
    func resume() {
        guard isEnabled && currentStatus == .paused else { return }

        currentStatus = .polling
        computeService?.startPolling()
    }

    // MARK: - Private Methods

    private func setupCallbacks() {
        computeService?.onTaskReceived = { [weak self] task in
            self?.activeTasks += 1
            self?.currentStatus = .executing
            NotificationCenter.default.post(
                name: NSNotification.Name("ComputeStatusChanged"),
                object: self?.activeTasks
            )
        }

        computeService?.onTaskCompleted = { [weak self] taskId, result in
            self?.activeTasks -= 1
            self?.tasksCompleted += 1
            self?.updateStatus()
            NotificationCenter.default.post(
                name: NSNotification.Name("ComputeStatusChanged"),
                object: self?.activeTasks
            )
        }

        computeService?.onTaskFailed = { [weak self] taskId, error in
            self?.activeTasks -= 1
            self?.tasksFailed += 1
            self?.updateStatus()
            NotificationCenter.default.post(
                name: NSNotification.Name("ComputeStatusChanged"),
                object: self?.activeTasks
            )
        }

        computeService?.onError = { [weak self] error in
            print("Compute service error: \(error)")
            // Don't change status for transient errors
        }
    }

    private func updateStatus() {
        if activeTasks > 0 {
            currentStatus = .executing
        } else if isEnabled {
            currentStatus = .polling
        } else {
            currentStatus = .idle
        }
    }

    private func startUptimeTimer() {
        uptimeTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, let startTime = self.startTime else { return }
            self.uptime = Date().timeIntervalSince(startTime)
        }
    }

    // MARK: - Resource Monitoring

    /// Check if system resources allow accepting more tasks
    func canAcceptTask() -> Bool {
        guard isEnabled else { return false }
        guard activeTasks < maxConcurrentTasks else { return false }

        // Check CPU usage
        let cpuUsage = getCurrentCPUUsage()
        if cpuUsage > maxCPUPercent {
            return false
        }

        // Check memory
        let memoryUsage = getCurrentMemoryUsage()
        if memoryUsage > maxMemoryMB {
            return false
        }

        return true
    }

    private func getCurrentCPUUsage() -> Double {
        // Simplified CPU usage check
        var cpuInfo = host_cpu_load_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let result = withUnsafeMutablePointer(to: &cpuInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }

        if result == KERN_SUCCESS {
            let userLoad = Double(cpuInfo.cpu_ticks.0)
            let systemLoad = Double(cpuInfo.cpu_ticks.1)
            let idleLoad = Double(cpuInfo.cpu_ticks.2)
            let niceLoad = Double(cpuInfo.cpu_ticks.3)
            let totalLoad = userLoad + systemLoad + idleLoad + niceLoad
            return totalLoad > 0 ? ((userLoad + systemLoad) / totalLoad) * 100 : 0
        }

        return 0
    }

    private func getCurrentMemoryUsage() -> Double {
        // Get memory usage in MB
        var taskInfo = task_basic_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_basic_info_data_t>.stride / MemoryLayout<natural_t>.stride)

        let result = withUnsafeMutablePointer(to: &taskInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_BASIC_INFO), $0, &count)
            }
        }

        if result == KERN_SUCCESS {
            return Double(taskInfo.resident_size) / (1024 * 1024)
        }

        return 0
    }

    // MARK: - Statistics

    /// Reset statistics
    func resetStatistics() {
        tasksCompleted = 0
        tasksFailed = 0
        UserDefaults.standard.set(0, forKey: "tasksCompleted")
        UserDefaults.standard.set(0, forKey: "tasksFailed")
    }
}

// MARK: - Double Extension

private extension Double {
    func nonZeroOr(_ defaultValue: Double) -> Double {
        return self > 0 ? self : defaultValue
    }
}
