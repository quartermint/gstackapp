import Foundation

public enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case networkError(Error)
    case httpError(statusCode: Int, message: String?)
    case unauthorized
    case forbidden
    case notFound
    case serverError(String?)
    case tokenExpired
    case noToken

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received from server"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .httpError(let statusCode, let message):
            return "HTTP error \(statusCode): \(message ?? "Unknown error")"
        case .unauthorized:
            return "Authentication required"
        case .forbidden:
            return "Access denied"
        case .notFound:
            return "Resource not found"
        case .serverError(let message):
            return "Server error: \(message ?? "Unknown error")"
        case .tokenExpired:
            return "Session expired, please log in again"
        case .noToken:
            return "No authentication token available"
        }
    }
}
