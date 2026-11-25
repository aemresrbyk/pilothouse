#!/bin/bash
# App Store screenshots in every app language, then framed with captions (frame.py).
# usage: docs/appstore/shoot.sh <out dir>   (needs Xcode, an iOS simulator runtime with iPhone 17 Pro Max, Chrome)
# The Debug build's -shots walk (mobile/ios/App/Shots.swift) signals each screen; this captures it full screen.
set -e
OUT=${1:?out dir}; HERE=$(cd "$(dirname "$0")" && pwd); IOS="$HERE/../../mobile/ios"; B=com.aemresrbyk.pilothouse.mobile
D=$(xcrun simctl list devices available | grep -m1 "Shots iPhone 17 Pro Max" | grep -oE '[0-9A-F-]{36}' || true)
[ -n "$D" ] || D=$(xcrun simctl create "Shots iPhone 17 Pro Max" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
(cd "$IOS" && xcodegen -q && xcodebuild -project Pilothouse.xcodeproj -scheme Pilothouse -configuration Debug \
  -destination "platform=iOS Simulator,id=$D" -derivedDataPath "$OUT/dd" build -quiet)
APP="$OUT/dd/Build/Products/Debug-iphonesimulator/Pilothouse.app"

shoot() { # <app language> <region>
  local L=$1 R=$2 C i f n
  xcrun simctl boot "$D" 2>/dev/null || true; xcrun simctl bootstatus "$D" -b >/dev/null
  xcrun simctl spawn "$D" defaults write -g AppleLanguages -array "$L"
  xcrun simctl spawn "$D" defaults write -g AppleLocale -string "$R"
  xcrun simctl shutdown "$D"; xcrun simctl boot "$D"; xcrun simctl bootstatus "$D" -b >/dev/null; sleep 8
  xcrun simctl uninstall "$D" $B 2>/dev/null || true; xcrun simctl install "$D" "$APP"
  xcrun simctl status_bar "$D" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --operatorName ""
  C=$(xcrun simctl get_app_container "$D" $B data); mkdir -p "$C/Documents" "$OUT/shots/$L"; rm -f "$OUT/shots/$L"/*
  xcrun simctl launch --terminate-running-process "$D" $B -shots >/dev/null
  for i in $(seq 1 120); do
    for f in "$C"/Documents/ready-*; do
      [ -e "$f" ] || continue; n=${f##*/ready-}; sleep 0.6
      xcrun simctl io "$D" screenshot --type=png "$OUT/shots/$L/shot-$n.png" >/dev/null 2>&1; rm -f "$f"
    done
    [ -f "$OUT/shots/$L/shot-5-changes.png" ] && break; sleep 0.5
  done
  echo "$L: $(ls "$OUT/shots/$L" | wc -l | tr -d ' ') shots"
}

for p in en:en_US tr:tr_TR es:es_ES pt-BR:pt_BR de:de_DE fr:fr_FR ru:ru_RU zh-Hans:zh_CN ja:ja_JP ko:ko_KR; do shoot "${p%%:*}" "${p##*:}"; done
xcrun simctl shutdown "$D"
python3 -I "$HERE/frame.py" "$OUT/shots" "$OUT/framed"
