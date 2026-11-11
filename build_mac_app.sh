#!/bin/bash
# Builds "Bangla Transcriber.app": a self-contained Mac app with its own
# Python, PyTorch and both AI models inside the bundle (works fully offline).
#
#   ./build_mac_app.sh              build app + DMG, Bangla + English models bundled (~5 GB)
#   ./build_mac_app.sh --install    also copy the app into /Applications
#   ./build_mac_app.sh --no-models  smaller app; models download on first use
#   ./build_mac_app.sh --no-dmg     skip the .dmg
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Bangla Transcriber"
BUNDLE_ID="local.bangla-transcriber"
VERSION="1.0.0"
PY_VER="3.12"
BUNDLE_MODELS=1; MAKE_DMG=1; INSTALL=0
for a in "$@"; do
  case "$a" in
    --no-models) BUNDLE_MODELS=0 ;;
    --no-dmg) MAKE_DMG=0 ;;
    --install) INSTALL=1 ;;
    *) echo "Unknown option: $a"; exit 1 ;;
  esac
done

say() { printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$*"; }
die() { printf "\033[1;31mError:\033[0m %s\n" "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "This script must be run on macOS."
ARCH="$(uname -m)"
DIST="$PWD/dist"
APP="$DIST/$APP_NAME.app"
RES="$APP/Contents/Resources"

# --- uv (fast Python/package manager; gives us a relocatable Python) -------
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  say "Installing uv (Python manager)…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

say "Getting a standalone Python $PY_VER…"
uv python install "$PY_VER"
PYBIN="$(uv python find --managed-python "$PY_VER" 2>/dev/null || uv python find "$PY_VER")"
PYHOME="$(cd "$(dirname "$PYBIN")/.." && pwd)"
[[ -f "$PYHOME/bin/python$PY_VER" ]] || die "Could not locate the standalone Python at $PYHOME"

say "Creating app bundle…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$RES"
cp -R "$PYHOME" "$RES/python"
RPY="$RES/python/bin/python$PY_VER"
find "$RES/python/lib" -maxdepth 2 -name EXTERNALLY-MANAGED -delete

say "Installing PyTorch, Transformers and friends into the app (a few minutes)…"
REQ="requirements.txt"
[[ "$ARCH" == "x86_64" ]] && REQ="requirements-intel.txt"
uv pip install --python "$RPY" --break-system-packages -r "$REQ"

cp -R app "$RES/app"
find "$RES/app" -name "__pycache__" -prune -exec rm -rf {} +

if [[ "$BUNDLE_MODELS" == 1 ]]; then
  MODEL_CACHE="$PWD/.model-cache"
  if [[ -d "$MODEL_CACHE" && -f "$MODEL_CACHE/.complete" ]]; then
    say "Reusing models downloaded by a previous build…"
  else
    say "Downloading the AI models (Bangla + English, about 6 GB, once)…"
    rm -rf "$MODEL_CACHE"
    "$RPY" "$RES/app/cli.py" --bundle-models "$MODEL_CACHE"
    touch "$MODEL_CACHE/.complete"
  fi
  mkdir -p "$RES/models"
  cp -R "$MODEL_CACHE"/*__* "$RES/models/"
fi

say "Pre-compiling Python files (faster start-up)…"
"$RPY" -m compileall -q -j 0 "$RES/python/lib" "$RES/app" >/dev/null 2>&1 || true

say "Making the icon…"
ICONSET="$DIST/AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
SRC_ICON="app/ui/icon.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC_ICON" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$SRC_ICON" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RES/AppIcon.icns"
rm -rf "$ICONSET"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSRequiresAquaSystemAppearance</key><false/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/$APP_NAME" <<'LAUNCH'
#!/bin/bash
R="$(cd "$(dirname "$0")/../Resources" && pwd)"
export PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 HF_HUB_DISABLE_TELEMETRY=1
export BT_MODELS_DIR="$R/models"
mkdir -p "$HOME/Library/Logs"
exec "$R/python/bin/python3" "$R/app/main.py" >>"$HOME/Library/Logs/Bangla Transcriber.log" 2>&1
LAUNCH
chmod +x "$APP/Contents/MacOS/$APP_NAME"

say "Signing (ad-hoc, for this Mac)…"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "  (signing skipped; the app still runs on this Mac)"

if [[ "$MAKE_DMG" == 1 ]]; then
  say "Creating DMG…"
  STAGE="$DIST/dmg"
  rm -rf "$STAGE" "$DIST/$APP_NAME.dmg"
  mkdir -p "$STAGE"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DIST/$APP_NAME.dmg" >/dev/null
  rm -rf "$STAGE"
fi

if [[ "$INSTALL" == 1 ]]; then
  say "Installing to /Applications…"
  rm -rf "/Applications/$APP_NAME.app"
  cp -R "$APP" /Applications/
  APP="/Applications/$APP_NAME.app"
fi

say "Done!"
echo "  App: $APP"
[[ "$MAKE_DMG" == 1 ]] && echo "  DMG: $DIST/$APP_NAME.dmg"
echo "  Open it with:  open \"$APP\""
