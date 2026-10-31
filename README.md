# Aurealis2

Multi-dimensional audio visualizer that collapses every dimension of audio analysis into a single 3D space.

Unlike tools like MiniMeters (8 separate meter views) or typical spectrograms (2D frequency-over-time), Aurealis2 maps **7 analysis dimensions** simultaneously onto visual properties of a point-cloud spectrogram.

## Dimensional Mapping

| Audio Dimension     | Visual Property        | How                                                    |
|---------------------|------------------------|--------------------------------------------------------|
| Frequency           | Y position (log)       | `log(freq)` mapped to vertical axis                    |
| Magnitude           | Alpha / brightness     | dB-linear over -70..0 dB × spectral prominence, ^1.5   |
| Stereo width        | X position             | L/R amplitude balance, gated to centre at the floor    |
| Time                | Z depth                | Circular buffer recedes into the screen                |
| Harmonic energy     | Saturation + sharpness | Tonal = vivid & crisp, noise = pastel & soft           |
| Transient energy    | Displacement + size    | Kick drums punch outward, transients flash larger      |
| Musical pitch       | Hue (whole cloud)      | Aurealis `fract(log2(f / 440))` of the strongest peaks, amplitude-blended, harmonics folded, smoothed ~0.3 s |

## Architecture

- **DSP**: C++ (iPlug2) with built-in Cooley-Tukey FFT, harmonic/transient/chord detection
- **GUI**: Three.js WebGL point-cloud renderer in WebView (also works standalone in browser)
- **Data flow**: `ProcessBlock -> SPSC ring buffer -> EvaluateJavaScript -> Three.js render`
- **Standalone mode**: Web Audio API with local FFT for browser-only use

## Status

| Phase | Description                | Status   |
|-------|----------------------------|----------|
| 1     | DSP Core (FFT, analysis)   | Complete |
| 2     | WebView UI (shaders, 3D)   | Complete |
| 3     | Advanced Analysis           | Complete |
| 4     | Parameters + Controls       | Complete |
| 5     | Polish + Web Distribution   | Web complete; VST/WASM deferred |

## Quick Start (Standalone)

```bash
npm install          # once: puppeteer for tests
npm run serve        # http://localhost:8080
```

Open http://localhost:8080 — drop an audio file, use the microphone, or hit **Play demo**. Press `?` in-app for the dimension legend and shortcuts.

## Testing

```bash
cmake --preset default && cmake --build build && ctest --test-dir build   # DSP (5 suites)
npm run gen:audio     # reference WAV (needs ffmpeg)
npm run test:visual   # 7 render checkpoints (screenshots)
npm run test:ui       # UI states: landing, panel, shortcuts, help
```

See TESTING.md for the full guide.
