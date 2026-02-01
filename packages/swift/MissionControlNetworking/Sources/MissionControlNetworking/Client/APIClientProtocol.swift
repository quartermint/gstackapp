import Foundation
import MissionControlModels

public protocol APIClientProtocol {
    var configuration: APIConfiguration { get }
    var authToken: String? { get set }

    func request<T: Decodable>(_ endpoint: String, method: HTTPMethod, body: Encodable?, authenticated: Bool) async throws -> T
}

public enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}
