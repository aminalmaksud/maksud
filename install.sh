#!/bin/bash
# Installs Bangla Transcriber on this Mac:
#   curl -fsSL https://raw.githubusercontent.com/aminalmaksud/maksud/bangla-transcriber/install.sh | bash
# Downloads the app (stored on GitHub in three parts), checks it, unpacks it into Applications and opens it.
set -uo pipefail

BASE="https://raw.githubusercontent.com/aminalmaksud/maksud/bangla-transcriber/release"
NAME="BanglaTranscriber-1.5-macos-arm64.tar.gz"
PARTS=3
VERSION="1.5"
SHA256="aca4762734abc4441e6d63c0c6f1867f9b53fba59c1c58c683ea6c6888726306"
APP="Bangla Transcriber.app"
LOG="$HOME/Library/Logs/Bangla Transcriber.log"

fail() {
  echo
  echo "Install failed: $*"
  echo "Please copy everything above and send it to Claude."
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "this must be run on a Mac."
echo "This Mac: $(uname -m), macOS $(sw_vers -productVersion 2>/dev/null || echo unknown)"
[[ "$(uname -m)" == "arm64" ]] || fail "this build needs an Apple Silicon Mac (M1 or later). Tell Claude you have an Intel Mac."

TMP="$(mktemp -d)" || fail "could not create a temporary folder."
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Bangla Transcriber (276 MB)…"
for ((i = 0; i < PARTS; i++)); do
  echo "  part $((i + 1)) of $PARTS"
  curl -fL --retry 3 --progress-bar "$BASE/$NAME.part$i" >> "$TMP/$NAME" || fail "download of part $((i + 1)) failed. Check your internet connection and run the command again."
done

echo "Checking the download…"
GOT="$(shasum -a 256 "$TMP/$NAME" | cut -d' ' -f1)"
[[ "$GOT" == "$SHA256" ]] || fail "the download is damaged (checksum $GOT). Run the command again."

echo "Unpacking…"
mkdir -p "$TMP/x" && tar -xzf "$TMP/$NAME" -C "$TMP/x" || fail "could not unpack the app."
[[ -x "$TMP/x/$APP/Contents/MacOS/Bangla Transcriber" ]] || fail "the unpacked app is incomplete."

# An app that is still open keeps running the old version (macOS would just bring it to the front), so close it first.
if pgrep -f "Resources/app/main.py" >/dev/null; then
  echo "Closing the open Bangla Transcriber…"
  pkill -f "Resources/app/main.py"
  for _ in $(seq 1 10); do pgrep -f "Resources/app/main.py" >/dev/null || break; sleep 0.5; done
  pkill -9 -f "Resources/app/main.py" 2>/dev/null || true
  sleep 1
fi

echo "Installing…"
DEST="/Applications"
if ! { rm -rf "$DEST/$APP" && mv "$TMP/x/$APP" "$DEST/"; } 2>/dev/null; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST" && rm -rf "$DEST/$APP" && mv "$TMP/x/$APP" "$DEST/" || fail "could not copy the app into $DEST."
fi
xattr -cr "$DEST/$APP" 2>/dev/null || true
echo "Installed to $DEST/$APP"

echo "Opening it…"
open "$DEST/$APP" || fail "macOS refused to open the app."
for _ in $(seq 1 12); do
  sleep 1
  pgrep -f "Resources/app/main.py" >/dev/null && { echo "Done! Bangla Transcriber $VERSION is running (the version is shown at the top left of the window)."; exit 0; }
done
echo
echo "The app was installed but did not stay open. Its log says:"
echo "-----"
tail -n 40 "$LOG" 2>/dev/null || echo "(no log file at $LOG)"
echo "-----"
fail "the app did not start."
