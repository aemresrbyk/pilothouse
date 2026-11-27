#!/bin/bash
# Builds the PH video into $1/final.mp4 and copies it to ../video.mp4.
# Needs in $1: phone.mov (rec.sh records it from the iOS -shots demo walk).
set -e; V=$1; H=$(cd "$(dirname "$0")" && pwd)
ffmpeg -v error -y -ss 17 -t 14 -i "$V/phone.mov" -vf "fps=30,scale=460:-2" -c:v libx264 -crf 18 -pix_fmt yuv420p -an "$V/phone.mp4"
"$H/webshot.sh" "$V"; cp "$H/promo.html" "$V/"; cp -R "$H/fonts" "$V/"; cp "$H/../logo-240.png" "$V/logo.png"
python3 "$H/music.py" "$V/music.wav" 51
(cd "$H/../../../.." && npx electron "$H/render.cjs" "$V" "$V/silent.mp4")
ffmpeg -v error -y -i "$V/silent.mp4" -i "$V/music.wav" -filter_complex "[0:v]fade=t=out:st=50:d=1[v];[1:a]highpass=f=30,lowpass=f=12000,aecho=0.8:0.5:375:0.15,loudnorm=I=-16:TP=-1.5,afade=t=out:st=48.5:d=2.5[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k -movflags +faststart -shortest "$V/final.mp4"
cp "$V/final.mp4" "$H/../video.mp4"
