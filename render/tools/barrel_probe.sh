#!/usr/bin/env bash
# #649: barrel-to-ball distance at ARRIVE (2.05 s) for swung pitches, via studio_probe.py (no screenshots).
#   THREE_DIR=.../node_modules/three/ bash render/tools/barrel_probe.sh [REPO] ['foul:1 foul:2 Lhit:1']
# Prints, per act:clip, the ball position, the sweet spot (bat local y .55) and the closest point of the barrel
# (bat local y .5-.82, BAT_LEN .82) to the ball. Acceptance of #649: barrel_min <= .1 m on seed 704 lefty and righty.
set -euo pipefail
REPO=${1:-$(cd "$(dirname "$0")/../.." && pwd)}; CLIPS=${2:-'foul:1 foul:2 Lhit:1'}
EXPR='(()=>{const C=X.bat.position.constructor,b=V(X.ball);let best=9,at=0;for(let y=.5;y<=.82;y+=.02){const p=X.bat.localToWorld(new C(0,y,0));const d=Math.hypot(p.x-b[0],p.y-b[1],p.z-b[2]);if(d<best){best=d;at=y}}const s=X.bat.localToWorld(new C(0,.55,0));return {ball:b,sweet:[s.x,s.y,s.z].map(v=>+v.toFixed(3)),barrel_min:+best.toFixed(3),at:+at.toFixed(2)}})()'
for ac in $CLIPS; do echo "== ${ac}"; python3 "$(dirname "$0")/studio_probe.py" "$REPO" "${ac%%:*}" "${ac##*:}" '2.05' "$EXPR" 2>&1 | head -1; done
