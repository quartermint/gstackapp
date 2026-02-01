import Foundation

public struct APIConfiguration {
    public let baseURL: URL
    public let defaultHeaders: [String: String]
    public let timeoutInterval: TimeInterval

    public init(
        baseURL: URL,
        defaultHeaders: [String: String] = [:],
        timeoutInterval: TimeInterval = 30
    ) {
        self.baseURL = baseURL
        self.defaultHeaders = defaultHeaders
        self.timeoutInterval = timeoutInterval
    }

    public static var `default`: APIConfiguration {
        APIConfiguration(
            baseURL: URL(string: "http://100.64.0.1:3000")!,
            defaultHeaders: ["Content-Type": "application/json"],
            timeoutInterval: 30
        )
    }
}
