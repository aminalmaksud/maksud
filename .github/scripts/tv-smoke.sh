#!/usr/bin/env bash
# Runs inside the emulator job: install, launch twice (first run = no servers, then with servers), print the result.
set -u
APK=app/build/outputs/apk/debug/app-debug.apk
PKG=com.moviehub.tv
adb install -r "$APK"

shot() { # small screenshot printed into the log as base64 (SHOT:<name>:<i>:<data>)
  adb exec-out screencap -p > "/tmp/$1.png" || return
  python3 - "$1" <<'EOF'
import base64, sys
name = sys.argv[1]
data = base64.b64encode(open(f"/tmp/{name}.png", "rb").read()).decode()
for i in range(0, len(data), 6000):
    print(f"SHOT:{name}:{i // 6000}:{data[i:i + 6000]}")
print(f"SHOT:{name}:end")
EOF
}

check() { # $1 = label
  sleep 20
  echo "=== $1: process"
  if adb shell pidof $PKG; then echo "RUNNING"; else echo "NOT RUNNING"; CRASHED=1; fi
  echo "=== $1: crash log"
  adb logcat -d -b crash | tail -80
  adb logcat -d | grep -E "AndroidRuntime|FATAL|moviehub" | tail -60
  shot "$1"
  adb logcat -c
}

CRASHED=0
adb logcat -c
echo "##### first launch (no servers set)"
adb shell am start -W -n $PKG/.MainActivity
check first

echo "##### launch with servers (the host is 10.0.2.2 from the emulator)"
adb shell am force-stop $PKG
cat > /tmp/moviehub.xml <<'EOF'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="servers">Movies 1080p | http://10.0.2.2:8000/m7/
Movies | http://10.0.2.2:8000/m14/
TV &amp; Web Series | http://10.0.2.2:8000/tv/</string>
    <string name="user"></string>
    <string name="pass"></string>
</map>
EOF
adb push /tmp/moviehub.xml /data/local/tmp/moviehub.xml
adb shell "run-as $PKG mkdir -p shared_prefs && run-as $PKG cp /data/local/tmp/moviehub.xml shared_prefs/moviehub.xml"
adb shell am start -W -n $PKG/.MainActivity
check home
adb shell input keyevent KEYCODE_DPAD_DOWN; adb shell input keyevent KEYCODE_DPAD_CENTER
check opened
exit $CRASHED
