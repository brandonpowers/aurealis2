#!/usr/bin/env bash
# Synthesize the bundled demo track for the Aurealis2 web app.
# 24 s, four layers designed to exercise every visual dimension:
#   - A-minor pad (A2+E3+A3+C4+E4) with slow tremolo  → harmonic color, saturation
#   - 2 Hz 80 Hz kick                                  → transient punch (Y/size)
#   - Off-beat noise hats, alternating L/R             → stereo spread, treble fill
#   - Slow arpeggio (A4/C5/E5/A5), one note per second → moving hue
# Requires: ffmpeg with lavfi + native AAC encoder.
#
# Fixes applied on top of the original draft (see task-11-report.md for detail):
#   - KICK envelope frequency doubled (2*2*PI*t) — the draft's cos(2*PI*t) only
#     pulsed at 1 Hz despite being labeled "2 Hz kick".
#   - PAD and KICK (mono aevalsrc sources) are explicitly duplicated to stereo
#     with pan=stereo|c0=c0|c1=c0 *before* amix. The draft mixed two mono
#     sources with two already-stereo sources (hats/arps) and then tried a
#     single trailing pan=stereo|c0=c0|c1=c1 to force stereo; ffmpeg's pan
#     filter detected that as a "pure channel mapping" and collapsed the whole
#     mix to mono, which silently zeroed the right channel.
#   - alimiter gets an explicit level=disabled. Without it, alimiter's default
#     auto-level normalizes the output back up toward 0 dBFS, defeating the
#     "limit" ceiling (measured peak was ~+2.6 dBFS despite limit=0.9).
#   - Limiter ceiling lowered from 0.9 to 0.8 (~-1.9 dBFS pre-encode) to leave
#     headroom for AAC's lossy inter-sample overshoot, which otherwise pushed
#     the decoded peak back above 0 dBFS.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/../resources/web/demo.m4a"
RATE=44100
DUR=24

PAD="0.16*(sin(110*2*PI*t)+sin(164.81*2*PI*t)+sin(220*2*PI*t)+sin(261.63*2*PI*t)+sin(329.63*2*PI*t))*(0.8+0.2*sin(0.5*2*PI*t))"
KICK="0.85*sin(80*2*PI*t)*pow(max(0,cos(2*2*PI*t)),8)"
ARP="0.22*sin( (440*lt(mod(t,4),1) + 523.25*between(mod(t,4),1,2) + 659.25*between(mod(t,4),2,3) + 880*gte(mod(t,4),3)) *2*PI*t)*(0.5+0.5*sin(1*2*PI*t))"

ffmpeg -y \
  -f lavfi -i "aevalsrc='${PAD}':s=${RATE}:d=${DUR}" \
  -f lavfi -i "aevalsrc='${KICK}':s=${RATE}:d=${DUR}" \
  -f lavfi -i "anoisesrc=color=white:duration=${DUR}:sample_rate=${RATE}:amplitude=0.18" \
  -f lavfi -i "aevalsrc='${ARP}':s=${RATE}:d=${DUR}" \
  -filter_complex "\
    [0]pan=stereo|c0=c0|c1=c0[pad_s];\
    [1]pan=stereo|c0=c0|c1=c0[kick_s];\
    [2]apulsator=hz=0.25:mode=square,volume='0.5*pow(max(0,sin(4*2*PI*t+PI)),6)':eval=frame,highpass=f=6000[hats];\
    [3]apulsator=hz=0.125[arps];\
    [pad_s][kick_s][hats][arps]amix=inputs=4:normalize=0,alimiter=limit=0.8:attack=5:release=50:level=disabled[out]" \
  -map "[out]" -ar "$RATE" -c:a aac -b:a 96k "$OUT" 2>/dev/null

echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
