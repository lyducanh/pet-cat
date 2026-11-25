#!/bin/sh
# usage: tools/grab-gemini.sh <breed> <side|belly>  -- waits for the newest Gemini download and files it
dst="assets/top/breeds/$1/$2-green.png"; mkdir -p "assets/top/breeds/$1"
for i in $(seq 1 15); do
  f=$(ls -t /c/Users/Admin/Downloads/Gemini_Generated_Image_*.png 2>/dev/null | head -1)
  if [ -n "$f" ] && [ $(( $(date +%s) - $(stat -c %Y "$f") )) -lt 90 ]; then mv "$f" "$dst"; echo "saved $dst"; exit 0; fi
  sleep 3
done
echo "no new download"; exit 1
