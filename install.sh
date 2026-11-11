#!/bin/bash
# Installs Bangla Transcriber on this Mac:
#   curl -fsSL https://raw.githubusercontent.com/aminalmaksud/maksud/bangla-transcriber/install.sh | bash
# Downloads the DMG (stored on GitHub in three parts), checks it, and copies the app to Applications.
set -euo pipefail

BASE="https://raw.githubusercontent.com/aminalmaksud/maksud/bangla-transcriber/release"
NAME="Bangla-Transcriber-1.2.dmg"
PARTS=3
SHA256="49cf26b14f9caed12bcd4ede60179c27cd434583177e86a9e61e7632cba5071b"
APP="Bangla Transcriber.app"

[[ "$(uname -s)" == "Darwin" ]] || { echo "Please run this on a Mac."; exit 1; }
[[ "$(uname -m)" == "arm64" ]] || echo "Warning: this build is for Apple Silicon Macs (M1 or later); it may not run here."

TMP="$(mktemp -d)"
MNT="$TMP/mnt"
cleanup() { hdiutil detach "$MNT" -quiet 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "Downloading Bangla Transcriber (273 MB)…"
for ((i = 0; i < PARTS; i++)); do
  echo "  part $((i + 1)) of $PARTS"
  curl -fL --retry 3 --progress-bar "$BASE/$NAME.part$i" >> "$TMP/$NAME"
done

echo "Checking the download…"
echo "$SHA256  $TMP/$NAME" | shasum -a 256 -c - >/dev/null || { echo "The download is damaged. Please run the command again."; exit 1; }

echo "Installing…"
mkdir -p "$MNT"
hdiutil attach "$TMP/$NAME" -nobrowse -readonly -mountpoint "$MNT" -quiet
DEST="/Applications"
if ! { rm -rf "$DEST/$APP" && ditto "$MNT/$APP" "$DEST/$APP"; } 2>/dev/null; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
  rm -rf "$DEST/$APP"
  ditto "$MNT/$APP" "$DEST/$APP"
fi
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "Done! Bangla Transcriber is in $DEST. Opening it now…"
open "$DEST/$APP"
