#!/usr/bin/env bash
# Download a Google Font as TTF.  usage: get_font.sh "Family Name" <weight> <out.ttf>
# Example: get_font.sh "Cinzel Decorative" 700 fonts/cinzel-deco-700.ttf
set -euo pipefail
fam="$1"; w="${2:-400}"; out="$3"
q=$(printf '%s' "$fam" | sed 's/ /+/g')
css=$(curl -sSf -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=${q}:wght@${w}&display=swap" || curl -sSf -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=${q}&display=swap")
url=$(printf '%s' "$css" | grep -oE "url\([^)]+\)" | head -1 | sed 's/url(//;s/)//')
[ -n "$url" ] || { echo "font not found: $fam" >&2; exit 1; }
mkdir -p "$(dirname "$out")"; curl -sSf -o "$out" "$url"; echo "saved $out"
