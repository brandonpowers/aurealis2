#!/usr/bin/env bash
# Generate a reference test WAV for visual verification of the Aurealis2 visualizer.
#
# Output: Aurealis2/resources/web/test-reference.wav
# Duration: 35 seconds (7 × 5-second segments)
#
# Segment table:
#   0:00-0:05  100 Hz sine, center      → Bottom, centered X, bright
#   0:05-0:10  1 kHz sine, center       → Mid-height, centered X, similar brightness
#   0:10-0:15  4 kHz sine, center       → Upper-mid, centered X, similar brightness
#   0:15-0:20  100 Hz sine, full LEFT   → Bottom, left side
#   0:20-0:25  100 Hz sine, full RIGHT  → Bottom, right side
#   0:25-0:30  White noise, stereo      → Full frequency + stereo fill
#   0:30-0:35  80 Hz kick pattern (2Hz) → Rhythmic bass transient punches
#
# Requires: ffmpeg with lavfi support

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/../resources/web/test-reference.wav"
RATE=44100
DUR=5

echo "Generating reference test audio..."

# Segment 1: 100 Hz center
S1=$(mktemp /tmp/aurealis_s1_XXXX.wav)
ffmpeg -y -f lavfi -i "sine=frequency=100:duration=${DUR}:sample_rate=${RATE}" \
  -ac 2 -ar "$RATE" "$S1" 2>/dev/null

# Segment 2: 1 kHz center
S2=$(mktemp /tmp/aurealis_s2_XXXX.wav)
ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=${DUR}:sample_rate=${RATE}" \
  -ac 2 -ar "$RATE" "$S2" 2>/dev/null

# Segment 3: 4 kHz center
S3=$(mktemp /tmp/aurealis_s3_XXXX.wav)
ffmpeg -y -f lavfi -i "sine=frequency=4000:duration=${DUR}:sample_rate=${RATE}" \
  -ac 2 -ar "$RATE" "$S3" 2>/dev/null

# Segment 4: 100 Hz full LEFT (left channel only)
S4=$(mktemp /tmp/aurealis_s4_XXXX.wav)
ffmpeg -y -f lavfi -i "sine=frequency=100:duration=${DUR}:sample_rate=${RATE}" \
  -filter_complex "[0]pan=stereo|c0=c0|c1=0*c0[out]" -map "[out]" -ar "$RATE" "$S4" 2>/dev/null

# Segment 5: 100 Hz full RIGHT (right channel only)
S5=$(mktemp /tmp/aurealis_s5_XXXX.wav)
ffmpeg -y -f lavfi -i "sine=frequency=100:duration=${DUR}:sample_rate=${RATE}" \
  -filter_complex "[0]pan=stereo|c0=0*c0|c1=c0[out]" -map "[out]" -ar "$RATE" "$S5" 2>/dev/null

# Segment 6: White noise, stereo (independent L/R channels)
S6=$(mktemp /tmp/aurealis_s6_XXXX.wav)
ffmpeg -y -f lavfi -i "anoisesrc=color=white:duration=${DUR}:sample_rate=${RATE}:amplitude=0.5" \
  -f lavfi -i "anoisesrc=color=white:duration=${DUR}:sample_rate=${RATE}:amplitude=0.5:seed=42" \
  -filter_complex "[0][1]amerge=inputs=2[out]" -map "[out]" -ar "$RATE" "$S6" 2>/dev/null

# Segment 7: 80 Hz kick pattern — 2 Hz pulse (amplitude modulated sine)
S7=$(mktemp /tmp/aurealis_s7_XXXX.wav)
ffmpeg -y -f lavfi \
  -i "aevalsrc='sin(80*2*PI*t) * ((sin(2*2*PI*t)+1)/2)':s=${RATE}:d=${DUR}" \
  -ac 2 -ar "$RATE" "$S7" 2>/dev/null

# Concatenate all segments
ffmpeg -y \
  -i "$S1" -i "$S2" -i "$S3" -i "$S4" -i "$S5" -i "$S6" -i "$S7" \
  -filter_complex "[0][1][2][3][4][5][6]concat=n=7:v=0:a=1[out]" \
  -map "[out]" -ar "$RATE" "$OUT" 2>/dev/null

# Clean up temp files
rm -f "$S1" "$S2" "$S3" "$S4" "$S5" "$S6" "$S7"

echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
echo ""
echo "Segment guide:"
echo "  0:00-0:05  100 Hz center    — bottom, centered, bright"
echo "  0:05-0:10  1 kHz center     — mid-height, centered, similar brightness"
echo "  0:10-0:15  4 kHz center     — upper-mid, centered, similar brightness"
echo "  0:15-0:20  100 Hz LEFT      — bottom, left side"
echo "  0:20-0:25  100 Hz RIGHT     — bottom, right side"
echo "  0:25-0:30  White noise      — full fill"
echo "  0:30-0:35  80 Hz kick @2Hz  — rhythmic bass pulses"
