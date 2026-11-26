#!/bin/bash
# Renders the caption PNGs (transparent, 1920x1080) from card.html into $1 with headless Chrome.
set -e; V=$1; H=$(cd "$(dirname "$0")" && pwd)
cp "$H/card.html" "$V/"; cp "$H/../logo-240.png" "$V/logo.png"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot(){ "$CH" --headless=new --lang=en-US --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=1920,1080 --screenshot="$V/c-$1.png" "file://$V/card.html#$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$2")" 2>/dev/null; }
shot title 'title'; shot end 'end'
shot d1 'top|Claude Code, Codex and Gemini CLI, side by side'
shot d2 'top|Everything they ask, in one Inbox'
shot d3 'top|See every change and test as it happens'
shot d4 'top|Any project or branch, one keystroke away'
shot d5 'top|CPU and memory of every agent. Stop any of them.'
shot fh 'feat|h'; for i in 0 1 2 3 4 5; do shot f$i "feat|$i"; done
shot w 'top|Away from your desk? Any browser, no install.'
shot p1 'left|On your iPhone|Who needs you,<br>on top.|Every agent on every computer, with its last message and your plan usage.'
shot p2 'left|Approve|Answer with<br>one tap.|The agent'"'"'s own options as buttons. Risky commands need two taps and Face ID.'
shot p4 'left|Live terminal|Exactly what'"'"'s<br>on your desk.|With the keys agents need: Esc, arrows, Tab, Ctrl+C.'
ls "$V"/c-*.png | wc -l
