#!/bin/bash
# Builds the PH video in $1. Needs there: phone.mov (rec.sh), web.png (webshot.sh), c-*.png (captions.sh).
# Every shot moves (slow push-in, phone slides in, captions ease in); shots join with xfade; music.py writes the track.
set -e
V=$1; H=$(cd "$(dirname "$0")" && pwd); cd "$V"
S=$H/../..; BG="color=c=0x0B0D10:s=1920x1080:r=30"; X=0.5
enc="-c:v libx264 -preset medium -crf 18 -r 30 -pix_fmt yuv420p -an"
img="-framerate 30 -loop 1"
cap="format=rgba,fade=t=in:st=0.3:d=0.5:alpha=1"
ease="pow(max(0\,1-(t-0.3)/0.5)\,2)"
push(){ echo "scale=3840:2160,zoompan=z='$1':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30"; }
card(){ ffmpeg -v error -y $img -t $2 -i c-$1.png -vf "$(push "$3"),format=yuv420p" -t $2 $enc seg-$1.mp4; }
shot(){ # still $1 at height $2, y $3, caption $4, secs $5
  ffmpeg -v error -y -f lavfi -t $5 -i $BG $img -t $5 -i "$1" $img -t $5 -i c-$4.png -filter_complex \
  "[1]scale=-1:$2[s];[0][s]overlay=(W-w)/2:$3,$(push "1+0.05*on/($5*30)")[a];[2]$cap[c];[a][c]overlay=0:'-36*$ease'" -t $5 $enc seg-$4.mp4; }
phone(){ ffmpeg -v error -y -f lavfi -t $3 -i $BG -ss $2 -t $3 -i phone.mov $img -t $3 -i mask.png $img -t $3 -i c-$1.png -filter_complex \
  "[1]fps=30,scale=460:1000,format=rgba[v];[2]format=gray,scale=460:1000[m];[v][m]alphamerge[ph];[0][ph]overlay=x='1250+760*pow(max(0\,1-t/0.8)\,3)':y=40[a];[3]$cap[c];[a][c]overlay=x='-50*$ease':y=0" -t $3 $enc seg-$1.mp4; }
feat(){ local d=6 in="-f lavfi -t 6 -i $BG $img -t 6 -i c-fh.png" f="[1]$cap[h];[0][h]overlay=0:'-30*$ease'[b0]"
  for i in 0 1 2 3 4 5; do in="$in $img -t $d -i c-f$i.png"; s=$(awk "BEGIN{print 0.9+0.3*$i}")
    f="$f;[$((i+2))]format=rgba,fade=t=in:st=$s:d=0.45:alpha=1[i$i];[b$i][i$i]overlay=0:'28*pow(max(0\,1-(t-$s)/0.45)\,2)'[b$((i+1))]"; done
  ffmpeg -v error -y $in -filter_complex "$f;[b6]null" -t $d $enc seg-feat.mp4; }
card title 4.5 "1+0.04*on/135"; card end 5 "1.05-0.05*on/150"
shot $S/screenshot-grid.png 880 170 d1 4.5; shot $S/screenshot-inbox.png 880 170 d2 4.5; shot $S/screenshot-diff-tests.png 880 170 d3 4.5
shot $S/screenshot-palette.png 880 170 d4 4; shot $S/screenshot-resources.png 880 170 d5 4
feat; shot web.png 870 180 w 5
phone p1 9 5; phone p2 18.5 5.5; phone p4 24.5 4.5
# name:secs:transition-into-next
P="title:4.5:pixelize d1:4.5:smoothleft d2:4.5:smoothleft d3:4.5:smoothleft d4:4:smoothleft d5:4:smoothup feat:6:smoothup w:5:smoothleft p1:5:smoothleft p2:5.5:smoothleft p4:4.5:fadeblack end:5:"
in=""; f=""; n=0; L=0; prev="0:v"; tr=""
for p in $P; do IFS=: read nm d t <<< "$p"; in="$in -i seg-$nm.mp4"
  if [ $n -gt 0 ]; then off=$(awk "BEGIN{print $L-$X}"); f="$f[$prev][$n:v]xfade=transition=$tr:duration=$X:offset=$off[x$n];"; prev="x$n"; L=$(awk "BEGIN{print $L+$d-$X}"); else L=$d; fi
  tr=$t; n=$((n+1)); done
python3 "$H/music.py" music.wav "$L"
ffmpeg -v error -y $in -i music.wav -filter_complex "${f}[$prev]fade=t=in:st=0:d=0.6,fade=t=out:st=$(awk "BEGIN{print $L-1}"):d=1,format=yuv420p[v];[$n:a]highpass=f=30,lowpass=f=12000,aecho=0.8:0.5:375:0.18,loudnorm=I=-16:TP=-1.5,afade=t=out:st=$(awk "BEGIN{print $L-2.5}"):d=2.5[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 18 -r 30 -c:a aac -b:a 192k -t $L -movflags +faststart pilothouse-producthunt.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_type,width,height -of compact pilothouse-producthunt.mp4
ffmpeg -v error -y -i pilothouse-producthunt.mp4 -vf "fps=1/2.5,scale=480:-1,tile=4x6" -frames:v 1 final.png
