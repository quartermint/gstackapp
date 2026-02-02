import Foundation
import MissionControlModels

open class BaseAPIClient: APIClientProtocol {
    public let configuration: APIConfiguration
    public var authToken: String?
    public var baseURLOverride: URL?

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(configuration: APIConfiguration = .default) {
        self.configuration = configuration

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = configuration.timeoutInterval
        self.session = URLSession(configuration: sessionConfig)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let timestamp = try? container.decode(Double.self) {
                return Date(timeIntervalSince1970: timestamp / 1000)
            } else if let dateString = try? container.decode(String.self) {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: dateString) {
                    return date
                }
                formatter.formatOptions = [.withInternetDateTime]
                if let date = formatter.date(from: dateString) {
                    return date
                }
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format")
        }

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    public func request<T: Decodable>(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: Encodable? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        let effectiveBaseURL = baseURLOverride ?? configuration.baseURL
        guard let url = URL(string: endpoint, relativeTo: effectiveBaseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue

        // Set default headers
        for (key, value) in configuration.defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        // Set auth header if needed
        if authenticated {
            guard let token = authToken else {
                throw APIError.noToken
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Encode body if present
        if let body = body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        switch httpResponse.statusCode {
        case 200...299:
            // Try wrapped response first (Hub returns {"success": true, "data": {...}})
            if let wrappedResponse = try? decoder.decode(APIResponse<T>.self, from: data) {
                return wrappedResponse.data
            }
            // Fall back to direct decoding for endpoints like /health
            return try decoder.decode(T.self, from: data)
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        default:
            let errorMessage = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: errorMessage?.error.message)
        }
    }
}

// API response wrapper for Hub's standard response format
private struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T
}

// Helper for encoding any Encodable
private struct AnyEncodable: Encodable {
    let value: Encodable

    init(_ value: Encodable) {
        self.value = value
    }

    func encode(to encoder: Encoder) throws {
        try value.encode(to: encoder)
    }
}

// Error response structure
private struct ErrorResponse: Decodable {
    let success: Bool
    let error: ErrorDetail
}

private struct ErrorDetail: Decodable {
    let code: String
    let message: String
}
