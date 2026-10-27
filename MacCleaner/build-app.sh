#!/bin/bash
# Builds a universal (Apple Silicon + Intel) "Mac Cleaner.app" into ./build.
# Requires Xcode or the Command Line Tools.
set -euo pipefail
cd "$(dirname "$0")"

ARCHS=(--arch arm64 --arch x86_64)
swift build -c release "${ARCHS[@]}"
BIN_DIR="$(swift build -c release "${ARCHS[@]}" --show-bin-path)"

APP="build/Mac Cleaner.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/MacCleaner" "$APP/Contents/MacOS/MacCleaner"
cp Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"   # ad-hoc signature so macOS will launch it

echo "Built: $(pwd)/$APP"
