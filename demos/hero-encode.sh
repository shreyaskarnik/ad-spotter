#!/usr/bin/env bash
# Trim videos/hero.webm to the clip and encode a looping GIF and an MP4.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(node -e 'console.log(require("./videos/hero.timing.json").startSec)')
D=$(node -e 'console.log(require("./videos/hero.timing.json").durationSec)')
FADE="fade=t=in:st=0:d=0.4:color=0x141417"
ffmpeg -nostdin -y -loglevel error -ss "$T" -t "$D" -i videos/hero.webm \
  -vf "$FADE,scale=1280:720:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 17 -movflags +faststart -an videos/ad-spotter-hero.mp4
ffmpeg -nostdin -y -loglevel error -ss "$T" -t "$D" -i videos/hero.webm \
  -vf "$FADE,fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  -loop 0 videos/ad-spotter-hero.gif
ls -la videos/ad-spotter-hero.*
