#!/bin/bash
V=$1; D=C541085B-1057-4B17-8389-19231C0EEFFC; B=com.aemresrbyk.pilothouse.mobile
C=$(xcrun simctl get_app_container $D $B data); mkdir -p "$C/Documents"; rm -f "$C"/Documents/ready-*
xcrun simctl terminate $D $B 2>/dev/null; sleep 2
xcrun simctl io $D recordVideo --codec=h264 --force "$V/phone.mov" > "$V/rec.log" 2>&1 & RP=$!
sleep 2
xcrun simctl launch $D $B -shots >/dev/null
T0=$(date +%s); seen=""
for i in $(seq 1 300); do
  for f in "$C"/Documents/ready-*; do [ -e "$f" ] || continue; n=${f##*/ready-}; echo "$n at $(( $(date +%s)-T0 ))s"; sleep 3.5; rm -f "$f"; seen="$seen $n"; done
  case "$seen" in *6-debate*) break;; esac; sleep 0.25
done
sleep 4; kill -INT $RP; wait $RP 2>/dev/null
ffprobe -v error -show_entries format=duration:stream=width,height -of compact "$V/phone.mov"
