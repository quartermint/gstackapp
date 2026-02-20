import SwiftUI

/// Red banner shown when the device is offline
struct OfflineBanner: View {
    @State private var connectionMonitor = ConnectionMonitor.shared

    var body: some View {
        if connectionMonitor.isOffline {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.caption)

                Text("No Connection")
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.red)
            .transition(.move(edge: .top).combined(with: .opacity))
            .animation(.easeInOut(duration: 0.3), value: connectionMonitor.isOffline)
        }
    }
}

// MARK: - Preview

#Preview {
    VStack {
        OfflineBanner()
        Spacer()
    }
}
