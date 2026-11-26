#!/bin/bash
# Screenshots the real web app (pilothouse-site/app) with made-up agents into $1/web.png.
set -e; V=$1; H=$(cd "$(dirname "$0")" && pwd)
bun "$H/web-mock.ts" & M=$!; trap "kill $M" EXIT; sleep 1.5
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --lang=en-US --accept-lang=en-US --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --window-size=1500,920 --virtual-time-budget=4000 --screenshot="$V/web.png" "file://$H/web-frame.html" 2>/dev/null
