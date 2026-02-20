// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MissionControlNetworking",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
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
