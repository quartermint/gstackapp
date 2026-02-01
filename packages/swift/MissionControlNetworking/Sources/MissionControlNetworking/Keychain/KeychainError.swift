import Foundation

public enum KeychainError: Error, LocalizedError {
    case itemNotFound
    case duplicateItem
    case unexpectedData
    case unhandledError(status: OSStatus)

    public var errorDescription: String? {
        switch self {
        case .itemNotFound:
            return "Keychain item not found"
        case .duplicateItem:
            return "Keychain item already exists"
        case .unexpectedData:
            return "Unexpected data format in keychain"
        case .unhandledError(let status):
            return "Keychain error: \(status)"
        }
    }
}
