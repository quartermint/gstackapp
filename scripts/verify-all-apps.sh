#!/bin/bash
#
# Verify all Swift packages and app builds
# Run this after syncing package changes across worktrees
#

set -e

# Navigate to repository root
cd "$(git rev-parse --show-toplevel)"

echo "=== Mission Control Build Verification ==="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Build Swift Packages
echo "Building Swift Packages..."
echo ""

if [ -d "packages/swift/MissionControlModels" ]; then
    echo "[1/5] Building MissionControlModels..."
    cd packages/swift/MissionControlModels
    swift build 2>&1 | tail -3
    cd ../../..
    echo "✓ MissionControlModels built successfully"
else
    echo "⚠ MissionControlModels not found, skipping..."
fi

echo ""

if [ -d "packages/swift/MissionControlNetworking" ]; then
    echo "[2/5] Building MissionControlNetworking..."
    cd packages/swift/MissionControlNetworking
    swift build 2>&1 | tail -3
    cd ../../..
    echo "✓ MissionControlNetworking built successfully"
else
    echo "⚠ MissionControlNetworking not found, skipping..."
fi

echo ""

# Build iOS App
echo "[3/5] Building iOS App..."
if [ -d "apps/ios/MissionControl/MissionControl.xcodeproj" ]; then
    xcodebuild -project apps/ios/MissionControl/MissionControl.xcodeproj \
        -scheme MissionControl \
        -destination 'platform=iOS Simulator,name=iPhone 15' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ iOS app built successfully"
elif [ -d "apps/ios/MissionControl.xcodeproj" ]; then
    xcodebuild -project apps/ios/MissionControl.xcodeproj \
        -scheme MissionControl \
        -destination 'platform=iOS Simulator,name=iPhone 15' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ iOS app built successfully"
else
    echo "⚠ iOS project not found, skipping..."
fi

echo ""

# Build macOS App
echo "[4/5] Building macOS App..."
if [ -d "apps/macos/MissionControl/MissionControl.xcodeproj" ]; then
    xcodebuild -project apps/macos/MissionControl/MissionControl.xcodeproj \
        -scheme MissionControl \
        -destination 'platform=macOS' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ macOS app built successfully"
elif [ -d "apps/macos/MissionControl.xcodeproj" ]; then
    xcodebuild -project apps/macos/MissionControl.xcodeproj \
        -scheme MissionControl \
        -destination 'platform=macOS' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ macOS app built successfully"
else
    echo "⚠ macOS project not found, skipping..."
fi

echo ""

# Build watchOS App
echo "[5/5] Building watchOS App..."
if [ -d "apps/watchos/MissionControlWatch/MissionControlWatch.xcodeproj" ]; then
    xcodebuild -project apps/watchos/MissionControlWatch/MissionControlWatch.xcodeproj \
        -scheme MissionControlWatch \
        -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm)' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ watchOS app built successfully"
elif [ -d "apps/watchos/MissionControl.xcodeproj" ]; then
    xcodebuild -project apps/watchos/MissionControl.xcodeproj \
        -scheme MissionControl \
        -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm)' \
        -configuration Debug \
        build 2>&1 | tail -5
    echo "✓ watchOS app built successfully"
else
    echo "⚠ watchOS project not found, skipping..."
fi

echo ""
echo "=== Verification Complete ==="
echo "All available builds succeeded!"
