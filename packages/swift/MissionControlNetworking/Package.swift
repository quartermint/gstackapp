// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MissionControlNetworking",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "MissionControlNetworking", targets: ["MissionControlNetworking"]),
    ],
    dependencies: [
        .package(path: "../MissionControlModels"),
    ],
    targets: [
        .target(
            name: "MissionControlNetworking",
            dependencies: ["MissionControlModels"]
        ),
    ]
)
