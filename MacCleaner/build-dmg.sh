#!/bin/bash
# Builds the app, then packages it as build/MacCleaner.dmg with an Applications shortcut.
set -euo pipefail
cd "$(dirname "$0")"

./build-app.sh

STAGE="build/dmg"
rm -rf "$STAGE" build/MacCleaner.dmg
mkdir -p "$STAGE"
cp -R "build/Mac Cleaner.app" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Mac Cleaner" -srcfolder "$STAGE" -ov -format UDZO build/MacCleaner.dmg

echo "Built: $(pwd)/build/MacCleaner.dmg"
