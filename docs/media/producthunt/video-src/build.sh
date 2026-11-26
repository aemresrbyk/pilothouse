#!/bin/bash
set -e
V=$1; cd $V
S=~/Desktop/projects/pilothouse/docs/media; BG="color=c=0x0B0D10:s=1920x1080:r=30"
F="format=yuv420p,setsar=1"
fade(){ echo "fade=t=in:st=0:d=0.35,fade=t=out:st=$(echo "$1-0.35"|bc):d=0.35"; }
enc="-c:v libx264 -preset medium -crf 18 -r 30 -an"
card(){ ffmpeg -v error -y -loop 1 -t $2 -i $1.png -vf "scale=1920:1080,$(fade $2),$F" -t $2 $enc seg-$3.mp4; }
desk(){ ffmpeg -v error -y -f lavfi -t 4 -i $BG -loop 1 -t 4 -i $S/$1 -loop 1 -t 4 -i c-$2.png -filter_complex "[1]scale=-1:880[s];[0][s]overlay=(W-w)/2:170[a];[a][2]overlay=0:0,$(fade 4),$F" -t 4 $enc seg-$2.mp4; }
phone(){ ffmpeg -v error -y -f lavfi -t $3 -i $BG -ss $2 -t $3 -i phone.mov -loop 1 -t $3 -i mask.png -loop 1 -t $3 -i c-$1.png -filter_complex "[1]fps=30,scale=460:1000,format=rgba[v];[2]format=gray,scale=460:1000[m];[v][m]alphamerge[ph];[0][ph]overlay=1250:40[a];[a][3]overlay=0:0,$(fade $3),$F" -t $3 $enc seg-$1.mp4; }
card c-title 3.5 0; desk screenshot-grid.png d1; desk screenshot-inbox.png d2; desk screenshot-diff-tests.png d3
phone p1 9 5; phone p2 18.5 5.5; phone p3 25 5; phone p4 32 4.5; phone p5 39.5 6; card c-end 4.5 9
printf "file 'seg-%s.mp4'\n" 0 d1 d2 d3 p1 p2 p3 p4 p5 9 > list.txt
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart pilothouse-producthunt.mp4
ffprobe -v error -show_entries format=duration,size:stream=width,height -of compact pilothouse-producthunt.mp4
ffmpeg -v error -y -i pilothouse-producthunt.mp4 -vf "fps=1/3.5,scale=480:-1,tile=4x4" -frames:v 1 final.png
