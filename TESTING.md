# Aurealis2 Testing Guide

## Overview

Aurealis2 has four categories of automated tests, plus two manual tools:

1. **C++ DSP unit tests** — validate the audio analysis pipeline (FFT, stereo, chords, etc.)
2. **Web analysis unit tests** — validate the pure helpers behind the Web Audio path (`js/analysis.js`)
3. **Visual reference tests** — validate the WebGL rendering via automated screenshots
4. **UI state tests** — validate the app chrome: landing, panel, shortcuts, help overlay, metadata
5. **Spectrum probe** — manual, prints magnitude / stereo-width / alpha statistics for a real audio file
6. **FPS measurement** — manual, real-GPU perf spot-check (not part of the gating suite)

Re-run (1) after DSP changes, (2) after any change to `js/analysis.js` or the dB→magnitude
mapping, (3) after shader/rendering changes, and (4) after any change to `index.html`,
`main.js`, `controls.js`, or `css/styles.css`. (5) is the way to reason about brightness
and stereo width numerically — run it on real music, not only the synthesized demo. (6) is
run by hand on a normal desktop session when investigating performance, not on every change.

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

**With CMake (preferred):**
```bash
cmake --preset default
cmake --build build
ctest --test-dir build --output-on-failure
```

**With CMake (manual, no preset):**
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

## Web Analysis Unit Tests

Located in `tests/web/`, run with Node's built-in test runner (no extra dependency).
They cover `Aurealis2/resources/web/js/analysis.js`, the pure functions that turn
`getFloatFrequencyData` dB values into what the shader sees:

| Function | What the tests pin down |
|----------|-------------------------|
| `dbToMagnitude` | `DB_FLOOR` (-70 dB) and below → 0, including `-Infinity`; 0 dB → 1; linear in dB between |
| `midMagnitudeFromDb` | L/R are averaged as linear amplitude first, so a hard-panned note is 6 dB down, not half as bright |
| `stereoBalance` | computed on linear amplitude (a 6 dB pan reads ≈ 0.58), hard-pan → ±1, silence → 0 |
| `stereoWidthForBin` | balance is gated by mid magnitude so noise-floor bins stay centred |
| `spectralProminence` | dB above the local mean over ≈ ±¼ octave; flat spectra → 0, a lone peak → its height |
| `prominenceGate` | `GATE_FLOOR` (0.15) at `PROMINENCE_LO` (1 dB), 1 at `PROMINENCE_HI` (9 dB), smoothstep between |
| `computeSpectrum` | the per-frame entry point main.js calls: a note keeps full magnitude, the bed under it fades to `GATE_FLOOR`, width follows the gated magnitude |
| `findSpectralPeaks` | up to 3 strongest peaks by linear amplitude, parabolic-interpolated; harmonics (and sub-harmonics) of a stronger peak fold into it; peaks > 20 dB under the strongest ignored |
| `blendHues` | weighted circular mean (short way round the circle); `strength` 0 when empty |
| `dominantHue` | one note → that note's aurealis hue even with harmonics present; a chord → between its notes, nearest the strongest; `colorTune` rotates; silence → strength 0 |

```bash
npm test
# equivalent: node --test tests/web/*.test.mjs
```

The C++ `StereoAnalyzer` uses the same floor (`StereoAnalyzer::DB_FLOOR`), the same
|X| / N normalisation and the same width gate, but **not yet the prominence gate** — the
plugin path is deferred and will need `spectralProminence` ported when it is revived. If
you change one side, change the other and update the table above.

---

## Spectrum Probe (manual, any real audio file)

`Aurealis2/scripts/probe-spectrum.mjs` simulates the Web Audio analyser (Blackman window,
|X| / N, smoothing 0.3 at 60 fps), runs the real `analysis.js` helpers, then applies a copy
of the fragment-shader alpha chain per bin. For each time it prints how many of the 2048
bins would be drawn, the brightness ratio between the loudest bin and the median bin, the
average |stereo width| of noise-floor bins, and the transient flux — alongside the
pre-October-2026 legacy mapping for comparison.

```bash
node Aurealis2/scripts/probe-spectrum.mjs path/to/track.mp3            # every 20 s
node Aurealis2/scripts/probe-spectrum.mjs path/to/track.mp3 5 60 120    # specific seconds
```

Use it on real recordings or a mic capture. The synthesized `demo.m4a` and
`test-reference.wav` have a digital-silence floor (≈ -120 dB) and never exhibit the
"signal on every frequency" problem the floor mapping exists to prevent. The shader math
inside the script is a hand-maintained copy of `spectrogram.frag.glsl`; update both.

For pictures of the same track, `Aurealis2/scripts/capture-track.mjs` uploads the file
through the landing page in headless Chrome and screenshots it at the given seconds. Pass
two ports to compare builds side by side (serve a `git worktree` of the previous commit on
the second port; copy the gitignored audio file into that worktree first):

```bash
node Aurealis2/scripts/capture-track.mjs path/to/track.mp3 --ports 8080,8081 --times 8,45,105 --out /tmp
# → /tmp/track-<port>-<t>s.png
```

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
npm install   # once: installs puppeteer from package.json
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

**FPS-sensitivity artifact:** the analysis feed (`pushWebAudioFrame`) runs once per
`requestAnimationFrame` tick, so the ring buffer / hue EMA advance is tied to frame
rate, not wall-clock time. On a heavily-loaded machine (low harness fps), checkpoint
screenshots can show transient ghost-trail artifacts that aren't present on an
unloaded system. If a checkpoint looks wrong, re-run `npm run test:visual` on an
otherwise-idle machine before treating it as a regression.

### Regenerating the Test Audio

The reference WAV and the bundled demo track are two different assets, generated by
two different scripts — don't confuse them:

| Asset | Script | Purpose |
|-------|--------|---------|
| `Aurealis2/resources/web/test-reference.wav` | `gen-test-audio.sh` (`npm run gen:audio`) | 7-segment checkpoint WAV used by the visual reference tests (`?ref` mode) |
| `Aurealis2/resources/web/demo.m4a` | `gen-demo-audio.sh` | Bundled "Play demo" track on the landing page — a musical loop, not a test fixture |

If you change the segment layout or need to recreate `test-reference.wav`:

```bash
npm run gen:audio
# equivalent: ./Aurealis2/scripts/gen-test-audio.sh
```

Requires `ffmpeg` with lavfi support. Output: `Aurealis2/resources/web/test-reference.wav` (35s, 44.1 kHz stereo).

To regenerate the demo track instead (rare — only if the demo audio design changes):

```bash
./Aurealis2/scripts/gen-demo-audio.sh
```

Requires `ffmpeg` with lavfi support and a native AAC encoder. Output:
`Aurealis2/resources/web/demo.m4a` (24s, 44.1 kHz stereo, tracked in git — this is a
shipped asset, not gitignored like the WAV/MP3 test fixtures).

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

## UI State Tests

`run-ui-tests.mjs` is the companion to `run-visual-tests.mjs`: instead of the
DSP/render pipeline, it verifies the app **chrome** — landing screen, settings
panel, keyboard shortcuts, help overlay, idle auto-hide, and page metadata. Each
test gets a fresh headless page (SwiftShader WebGL, same as the visual tests) and,
on success, a screenshot at `<out>/ui-<slug>.png`.

Runs in CI as part of the `visual-tests` job in `.github/workflows/build.yml`,
right after the visual checkpoint tests, against the same `visual-out/` directory
— its `ui-*.png` screenshots are picked up by the same `visual-checkpoints`
artifact upload alongside the checkpoint screenshots.

### Run

```bash
# Ensure the web server is running on port 8080, then:
npm run test:ui
# equivalent: node Aurealis2/scripts/run-ui-tests.mjs [--port 8080] [--out /tmp]
```

### The 13 Tests

| # | Test | What it validates |
|---|------|--------------------|
| 1 | page loads without errors and design tokens are defined | Page loads cleanly; `--accent` CSS custom property is defined on `:root` |
| 2 | bundled fonts are loaded | Inter and JetBrains Mono `@font-face` rules register and reach `loaded` status |
| 3 | status strip contains wordmark, readouts, cameras, and gear | Status strip has the wordmark, time display, fps counter, camera preset buttons, and settings gear |
| 4 | settings panel opens with three grouped sections | Clicking the gear opens the panel with **Analysis** / **Geometry** / **Color** groups |
| 5 | chrome auto-hides after idle and returns on mouse move | `ui-idle` is applied to `<body>` after ~3.6s idle; mouse move clears it |
| 6 | landing shows on default load with three actions | Landing screen is visible by default with Open File / Use Mic / Play Demo buttons |
| 7 | play demo hides landing and starts playback | Clicking Play Demo hides landing; source display shows "demo" |
| 8 | ref mode skips the landing | `?ref` query param skips the landing screen (used by the visual reference tests) |
| 9 | keyboard: camera presets and chrome hide | Key `2` activates the front camera preset; `h` toggles `ui-hidden` on and off |
| 10 | help overlay toggles with ? and closes with Escape | `?` opens the help overlay (7-row dimension legend); `Escape` closes it |
| 11 | page metadata: title, description, favicon | Title starts with "Aurealis", meta description is present, favicon link resolves and loads |
| 12 | fft size and time depth controls actually apply | Changing the FFT-size select and the time-depth slider actually rebuilds the analyser/renderer state (not just the displayed value), and the renderer keeps running afterward |
| 13 | color mode select switches the shader mode and defaults to full | The Color → Mode select lists `full` first and `slice`; the renderer starts in `full`; selecting `slice` updates the `uColorMode` uniform and the renderer keeps running |

### How to Add a Test

Append a `test(name, fn)` block **before** the `// ---- runner --` section near the
bottom of `run-ui-tests.mjs`. `fn` receives a fresh Puppeteer `page`; navigate it,
assert whatever you need, and `throw new Error(...)` on failure — the runner
catches it, prints `FAIL <name>: <message>`, and continues to the next test.
On success, a screenshot is captured automatically; no extra code needed.

```js
test('my new behavior', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    // ...assert something, throw on failure...
});
```

### When to Run

- After any change to `index.html`, `main.js`, `controls.js`, or `css/styles.css`
- After adding/changing a keyboard shortcut or the help overlay legend
- After changing the landing screen or settings panel structure

---

## FPS Measurement

`measure-fps.mjs` is a **manual** performance spot-check, separate from the gating
test suites above. Unlike `run-visual-tests.mjs` (deliberately deterministic
SwiftShader software rendering), it tries to reach the **real GPU**: headful Chrome
when `$DISPLAY` is set, headless+EGL otherwise. It samples
`window.__aurealisDebug.getFPS()` once per second during demo playback and prints
the renderer string plus average/min fps.

### Run

```bash
node Aurealis2/scripts/measure-fps.mjs [--port 8080] [--seconds 12]
```

Requires a normal desktop session (a real display / GPU access) — see status below.

### Current Status

No real-GPU fps number has been recorded yet. In this sandboxed development
environment, headful Chrome is killed externally (unrelated to memory pressure)
roughly 55-60s after launch — before any sample is collected — and the
headless+EGL fallback cannot create a GL context at all here. Both failure modes
are environment constraints, not bugs in the script or the app. **Do not treat the
absence of a number as a pass or a fail — it is simply unmeasured.**

To get a real reading, run the command above from a normal desktop terminal (not
this sandbox) with a display attached.

### Regression Reference

Until a real-GPU number exists, the regression baseline is the **SwiftShader
harness fps** observed during `npm run test:visual`: steady-state ~42-49 fps, with
occasional 25-33 fps dips attributed to system load. A future run of
`measure-fps.mjs` on real hardware should establish the actual real-GPU baseline;
until then, don't cite a specific real-GPU fps number in docs, commit messages, or
reports — there isn't one yet.

---

## Known Issues with Automated Visual Tests

- **Software rendering:** SwiftShader may produce slightly different alpha blending
  and triangle rasterization vs hardware GPU.
- **Timing sensitivity:** If the system is slow, checkpoint overlays may not appear
  within the timeout window. Increase `--timeout` in the script if needed.
- **FPS-sensitivity artifact:** low-fps harness runs can show transient ghost-trail
  ordering artifacts (see the note in "Visual Reference Tests" above) — re-run on an
  idle machine before treating one as a real regression.
- **No pixel-level comparison yet:** Screenshots are for human review. Automated
  pixel-diff regression is a future enhancement.
- **No real-GPU fps baseline yet:** `measure-fps.mjs` exists but hasn't produced a
  number in this environment; see "FPS Measurement" above.

---

## Dev Server (no cache, live reload)

`npm run serve` now runs `Aurealis2/scripts/dev-server.mjs` (no dependencies). It serves the
web directory with `Cache-Control: no-store` on every response — a plain static server lets
Chrome reuse `main.js` and the `.glsl` shaders for days without asking — and reloads every
open tab when any file under `Aurealis2/resources/web` changes. The reload hook is injected
into `index.html` by the server only; nothing on disk changes, so the same tree still works
inside the iPlug2 WebView. `npm run serve:static` keeps the old python server (what CI uses).

```bash
npm run serve                      # http://localhost:8080, no-store + live reload
node Aurealis2/scripts/dev-server.mjs --port 8082 --no-reload
```

If you must use another static server, open DevTools → Network → "Disable cache" (only
active while DevTools is open) or hard-refresh with Ctrl+Shift+R after every JS/GLSL edit.

---

## Quick Reference

```bash
# Configure + build + run all DSP tests
cmake --preset default && cmake --build build && ctest --test-dir build --output-on-failure

# Run web analysis unit tests
npm test

# Probe magnitude / stereo width / alpha statistics on a real track
node Aurealis2/scripts/probe-spectrum.mjs path/to/track.mp3

# Run visual reference test (manual)
# browser → http://localhost:8080/index.html?ref

# Run visual reference test (automated, 7 checkpoints)
npm run test:visual

# Run UI state tests (automated, 13 tests)
npm run test:ui

# Regenerate reference WAV
npm run gen:audio

# Measure real-GPU fps (manual, needs a normal desktop session)
node Aurealis2/scripts/measure-fps.mjs
```
