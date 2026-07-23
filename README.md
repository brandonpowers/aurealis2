# Aurealis2

Multi-dimensional audio visualizer that collapses every dimension of audio analysis into a single 3D space.

Unlike tools like MiniMeters (8 separate meter views) or typical spectrograms (2D frequency-over-time), Aurealis2 maps **7 analysis dimensions** simultaneously onto visual properties of a point-cloud spectrogram.

## Dimensional Mapping

| Audio Dimension     | Visual Property        | How                                                    |
|---------------------|------------------------|--------------------------------------------------------|
| Frequency           | Y position (log)       | `log(freq)` mapped to vertical axis                    |
| Magnitude           | Alpha / brightness     | Squared magnitude drives opacity                       |
| Stereo width        | X position             | L/R balance spreads points left/right                  |
| Time                | Z depth                | Circular buffer recedes into the screen                |
| Harmonic energy     | Saturation + sharpness | Tonal = vivid & crisp, noise = pastel & soft           |
| Transient energy    | Displacement + size    | Kick drums punch outward, transients flash larger      |
| Musical pitch       | Hue (per-bin)          | Aurealis formula: `hue = fract(log2(freq / 440))`      |

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
| 5     | Polish + Web Distribution   | Partial  |

## Quick Start (Standalone)

```bash
cd Aurealis2/resources/web
python3 -m http.server 8080
# Open http://localhost:8080 in browser
```

Drop an audio file or allow microphone access to start visualizing.
