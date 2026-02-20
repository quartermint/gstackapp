import UIKit

/// Centralized haptic feedback for the app
enum HapticService {
    /// Task successfully dispatched
    static func taskDispatched() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }

    /// Command or action executed successfully
    static func commandExecuted() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
    }

    /// Connection state changed
    static func connectionChanged(connected: Bool) {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(connected ? .success : .warning)
    }

    /// An error occurred
    static func error() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }

    /// Selection changed (filter, tab, etc.)
    static func selectionChanged() {
        let generator = UISelectionFeedbackGenerator()
        generator.selectionChanged()
    }
}
