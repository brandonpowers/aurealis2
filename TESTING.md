# Aurealis2 Testing Guide

## Overview

Aurealis2 has two categories of tests:

1. **C++ DSP unit tests** — validate the audio analysis pipeline (FFT, stereo, chords, etc.)
2. **Visual reference tests** — validate the WebGL rendering via automated screenshots

Both should be re-run after any changes to DSP code or shader/rendering code.

---

## C++ DSP Unit Tests

Located in `tests/`. Five test executables covering 22 sub-tests total.

### Test Files

| File | Tests | What it validates |
|------|-------|-------------------|
| `test_fft.cpp` | 2 | FFT peak detection (440 Hz), SNR, stereo channel match |
| `test_ringbuffer.cpp` | 6 | SPSC ring buffer: empty/full, FIFO order, wrap-around, AnalysisFrame (~49KB) round-trip |
| `test_chord.cpp` | 5 | Chord detection: C major, A minor, G7, silence, F major |
| `test_harmonic.cpp` | 4 | Harmonic energy: sawtooth vs sine, detector sensitivity |
| `test_integration.cpp` | 5 | End-to-end pipeline: audio pass-through, frame content, stereo detection, parameter setters |

### How to Run

**With CMake:**
```bash
mkdir -p build && cd build
cmake .. -DAUREALIS2_BUILD_TESTS=ON
cmake --build .
ctest --output-on-failure
```

**Direct compilation (no cmake):**
```bash
g++ -std=c++17 -I Aurealis2/dsp tests/test_fft.cpp -o test_fft && ./test_fft
```

### When to Run

- After any change to files in `Aurealis2/dsp/`
- After changing FFT size, sample rate, or frequency constants
- After modifying the analysis pipeline or ring buffer

---

## Visual Reference Tests

A 7-segment WAV file exercises the full rendering pipeline. The visualizer pauses at
each segment boundary (checkpoint) so you can verify the display matches expectations.

### The 7 Segments

| # | Time | Audio | Expected Visual |
|---|------|-------|-----------------|
| 1 | 0:03 | 100 Hz sine, CENTER | Narrow bright line at BOTTOM, centered on X |
| 2 | 0:08 | 1 kHz sine, CENTER | Narrow line at MID-HEIGHT, centered, similar brightness to #1 |
| 3 | 0:13 | 4 kHz sine, CENTER | Narrow line in UPPER region, centered, similar brightness |
| 4 | 0:18 | 100 Hz sine, LEFT | Line at BOTTOM, shifted LEFT of center |
| 5 | 0:23 | 100 Hz sine, RIGHT | Line at BOTTOM, shifted RIGHT (mirror of #4) |
| 6 | 0:28 | White noise, stereo | Full frequency fill (bottom to top) + stereo spread (left to right) |
| 7 | 0:33 | 80 Hz kick @ 2 Hz | Rhythmic pulses at bottom, ~2 flashes/sec |

### What Each Segment Validates

- **#1-3 (frequency mapping + brightness):** Y position scales logarithmically with frequency.
  All three sines are identical amplitude — brightness should be comparable (density compensation).
- **#4-5 (stereo positioning):** X axis maps stereo field. LEFT/RIGHT should be mirrored.
  Centered signals (#1-3) must not drift left or right.
- **#6 (broadband):** All frequencies + stereo represented. Treble shouldn't overpower bass.
- **#7 (transients):** Transient detector should produce visible pulsing, not a static line.

### Manual Testing (Interactive)

1. Start a web server:
   ```bash
   cd Aurealis2/resources/web
   python3 -m http.server 8080
   ```
2. Open `http://localhost:8080/index.html?ref` in a browser
3. Click to start playback — audio pauses at each checkpoint
4. Verify the visual matches the on-screen description
5. Click the overlay to advance to the next checkpoint

### Automated Testing (Headless Screenshots)

Captures screenshots at each checkpoint using Puppeteer + headless Chrome.

**Prerequisites:**
```bash
npm install puppeteer
```

**Run:**
```bash
# Ensure web server is running on port 8080, then:
node Aurealis2/scripts/run-visual-tests.mjs [--port 8080] [--out /tmp]
```

**Output:** `aurealis-cp1.png` through `aurealis-cp7.png` in the output directory.

**Note:** Headless Chrome uses SwiftShader (software WebGL), so rendering may differ
slightly from a real GPU — colors and blending can vary. Use these screenshots for
layout/positioning verification. For brightness and color accuracy, use manual testing.

### Regenerating the Test Audio

If you change the segment layout or need to recreate `test-reference.wav`:

```bash
./Aurealis2/scripts/gen-test-audio.sh
```

Requires `ffmpeg` with lavfi support. Output: `Aurealis2/resources/web/test-reference.wav` (35s, 44.1 kHz stereo).

If you add/remove/reorder segments, also update:
- `gen-test-audio.sh` — the ffmpeg segment generation
- `main.js` checkpoints array (line ~26) — pause times and labels
- `run-visual-tests.mjs` — NUM_CHECKPOINTS constant
- This file — the segment table above

### When to Run

- After any change to files in `Aurealis2/resources/web/shaders/`
- After modifying `spectrogram.js`, `renderer.js`, or geometry code
- After changing frequency mapping, stereo positioning, or density compensation
- After modifying the analysis-to-texture pipeline (`main.js:pushWebAudioFrame`)

---

## Known Issues with Automated Visual Tests

- **Software rendering:** SwiftShader may produce slightly different alpha blending
  and triangle rasterization vs hardware GPU.
- **Timing sensitivity:** If the system is slow, checkpoint overlays may not appear
  within the timeout window. Increase `--timeout` in the script if needed.
- **No pixel-level comparison yet:** Screenshots are for human review. Automated
  pixel-diff regression is a future enhancement.

---

## Quick Reference

```bash
# Run all DSP tests
cd build && ctest --output-on-failure

# Run visual reference test (manual)
# browser → http://localhost:8080/index.html?ref

# Run visual reference test (automated)
node Aurealis2/scripts/run-visual-tests.mjs

# Regenerate test audio
./Aurealis2/scripts/gen-test-audio.sh
```
