#!/bin/bash
# Double-click this file in Finder to start MovieHub, then use it in your browser.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (LTS), then double-click this file again."
  read -r -p "Press Enter to close…"; exit 1
fi
( sleep 1; open "http://localhost:8080" ) &
node server.js
