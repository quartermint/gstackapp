import Foundation
import UserNotifications
import UIKit
import Observation

/// Notification categories for different types of alerts
enum NotificationCategory: String {
    case taskCompleted = "TASK_COMPLETED"
    case taskFailed = "TASK_FAILED"
    case systemAlert = "SYSTEM_ALERT"
    case nodeOffline = "NODE_OFFLINE"
}

/// Service for managing push notifications
@MainActor
@Observable
final class NotificationService: NSObject {
    static let shared = NotificationService()

    private(set) var isAuthorized = false
    private(set) var deviceToken: String?

    private var pendingTokenRegistration: ((String) -> Void)?

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Authorization

    /// Request permission for push notifications
    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()

        do {
            let granted = try await center.requestAuthorization(
                options: [.alert, .sound, .badge, .provisional]
            )
            self.isAuthorized = granted

            if granted {
                await registerForRemoteNotifications()
                setupNotificationCategories()
            }

            return granted
        } catch {
            print("Failed to request notification authorization: \(error)")
            return false
        }
    }

    /// Check current authorization status
    func checkAuthorizationStatus() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        switch settings.authorizationStatus {
        case .authorized, .provisional:
            self.isAuthorized = true
        case .denied, .notDetermined, .ephemeral:
            self.isAuthorized = false
        @unknown default:
            self.isAuthorized = false
        }
    }

    // MARK: - Remote Notifications

    /// Register with APNs for remote notifications
    func registerForRemoteNotifications() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
                continuation.resume()
            }
        }
    }

    /// Handle successful device token registration
    func handleDeviceToken(_ token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = tokenString
        print("Device token: \(tokenString)")

        // Register with Hub
        Task {
            await registerDeviceWithHub(token: tokenString)
        }
    }

    /// Handle device token registration failure
    func handleRegistrationError(_ error: Error) {
        print("Failed to register for remote notifications: \(error)")
    }

    // MARK: - Hub Registration

    /// Register device token with the Hub for push notifications
    private func registerDeviceWithHub(token: String) async {
        do {
            try await APIClient.shared.registerDevice(token: token)
        } catch {
            print("Failed to register device with Hub: \(error)")
        }
    }

    // MARK: - Notification Categories

    /// Setup notification action categories
    private func setupNotificationCategories() {
        let viewAction = UNNotificationAction(
            identifier: "VIEW_ACTION",
            title: "View",
            options: [.foreground]
        )

        let dismissAction = UNNotificationAction(
            identifier: "DISMISS_ACTION",
            title: "Dismiss",
            options: [.destructive]
        )

        let taskCategory = UNNotificationCategory(
            identifier: NotificationCategory.taskCompleted.rawValue,
            actions: [viewAction, dismissAction],
            intentIdentifiers: [],
            options: []
        )

        let alertCategory = UNNotificationCategory(
            identifier: NotificationCategory.systemAlert.rawValue,
            actions: [viewAction, dismissAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            taskCategory,
            alertCategory
        ])
    }

    // MARK: - Local Notifications

    /// Schedule a local notification
    func scheduleLocalNotification(
        title: String,
        body: String,
        category: NotificationCategory,
        userInfo: [String: Any] = [:],
        delay: TimeInterval = 0
    ) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = category.rawValue
        content.userInfo = userInfo

        let trigger: UNNotificationTrigger?
        if delay > 0 {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        } else {
            trigger = nil
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            print("Failed to schedule notification: \(error)")
        }
    }

    /// Clear all pending notifications
    func clearPendingNotifications() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    /// Clear all delivered notifications
    func clearDeliveredNotifications() {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    /// Update app badge count
    func setBadgeCount(_ count: Int) async {
        do {
            try await UNUserNotificationCenter.current().setBadgeCount(count)
        } catch {
            print("Failed to set badge count: \(error)")
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationService: UNUserNotificationCenterDelegate {
    /// Handle notification when app is in foreground
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]
    }

    /// Handle notification tap
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo

        switch response.actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            await handleNotificationTap(userInfo: userInfo)

        case "VIEW_ACTION":
            await handleNotificationTap(userInfo: userInfo)

        case "DISMISS_ACTION":
            break

        default:
            break
        }
    }

    /// Handle notification tap action
    private func handleNotificationTap(userInfo: [AnyHashable: Any]) async {
        if let taskId = userInfo["taskId"] as? String {
            print("Navigate to task: \(taskId)")
        }
    }
}
