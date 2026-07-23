// Aurealis2 spectrogram vertex shader.
// Reads per-vertex data from DataTexture to position vertices in 3D space.
//
// Axes:
//   Y = log(frequency), perceptually linear, centered in view
//   X = stereo width * stereoSpread (from texture G channel)
//   Z = -age * zStep (circular buffer unwinding into the screen)

uniform sampler2D uDataTexture;
uniform sampler2D uHueTexture;  // Per-slice dominant hue (timeDepth × 1, R channel)
uniform float uWriteIndex;      // Current write position in circular buffer
uniform float uTimeDepth;       // Number of time slices
uniform float uNumBins;         // Number of frequency bins
uniform float uStereoSpread;    // X-axis scale for stereo width
uniform float uZSpacing;        // Z-axis spacing between time slices
uniform float uFadeDepth;       // Alpha fade over time depth
uniform float uSampleRate;      // For frequency calculation
uniform float uFFTSize;         // For frequency calculation
uniform float uPointSize;      // Base point sprite size
uniform float uColorTune;     // 0-1 hue rotation
uniform float uDominantHue;  // Smoothed dominant pitch hue for musical color coherence

attribute float aBinIndex;
attribute float aTimeIndex;

varying float vMagnitude;
varying float vStereoWidth;
varying float vHarmonicEnergy;
varying float vTransientEnergy;
varying float vFrequency;
varying float vNormFreq;        // 0-1 normalized frequency position
varying float vAge;             // 0 = newest, 1 = oldest
varying float vHue;             // Per-slice dominant hue (baked at write time)
varying float vDensityWeight;   // Log-frequency density compensation
varying float vPointSize;

void main() {
    // UV coordinates into the DataTexture (circular buffer unwinding)
    vec2 uv = vec2(
        (aBinIndex + 0.5) / uNumBins,
        (mod(uWriteIndex - aTimeIndex - 1.0 + uTimeDepth, uTimeDepth) + 0.5) / uTimeDepth
    );

    // Sample the RGBA data texture
    vec4 data = texture2D(uDataTexture, uv);
    float magnitude   = data.r;
    float stereoWidth = data.g * 2.0 - 1.0;  // Remap 0-1 back to -1..+1
    float harmonic    = data.b;
    float transient   = data.a;

    // Frequency for this bin (Hz)
    float frequency = (aBinIndex + 1.0) * uSampleRate / uFFTSize;

    // Per-bin aurealis hue blended toward dominant pitch
    float perBinHue = fract(log2(max(frequency, 20.0) / 440.0) + uColorTune);
    // Circular shortest-path blend (avoids ugly mid-hue interpolation)
    float hueDiff = uDominantHue - perBinHue;
    hueDiff = hueDiff - floor(hueDiff + 0.5);  // Wrap to [-0.5, 0.5]
    float hue = fract(perBinHue + hueDiff * harmonic * 0.7);

    // Y position: log-scale frequency, mapped to 0..8 world units
    float logMin = log(20.0);       // 20 Hz audible floor
    float logMax = log(16000.0);    // 16 kHz practical ceiling
    float logFreq = log(max(frequency, 20.0));
    float normFreq = clamp((logFreq - logMin) / (logMax - logMin), 0.0, 1.0);
    float yPos = normFreq * 8.0;

    // X position: stereo width only — no inter-bin spread needed for point sprites
    float xPos = stereoWidth * uStereoSpread;

    // Transient punch: frequency-aware displacement
    // Bass (< 200 Hz) gets strong Y push, mids (200-2k Hz) get moderate X spread
    float bassWeight = smoothstep(0.15, 0.0, normFreq);    // Strong below ~200 Hz
    float midWeight  = smoothstep(0.0, 0.15, normFreq) * smoothstep(0.55, 0.3, normFreq);  // 200 Hz - 2 kHz
    float transientPunch = transient * 2.0;
    yPos += transientPunch * bassWeight * 0.6;
    xPos *= 1.0 + transientPunch * (bassWeight * 0.3 + midWeight * 0.15);

    // Z position: time history (newest at front, oldest receding into screen)
    float age = aTimeIndex / uTimeDepth;
    float zPos = -aTimeIndex * uZSpacing;

    // Density compensation: log-spaced bins overlap more at high freq
    // Weight each bin by its log-spacing relative to ~1 kHz reference
    float binDelta = log((aBinIndex + 2.0) / (aBinIndex + 1.0));
    float refBin = floor(1000.0 * uFFTSize / uSampleRate);  // ~1 kHz reference
    float refDelta = log((refBin + 2.0) / (refBin + 1.0));
    float rawWeight = clamp(binDelta / refDelta, 0.1, 4.0);
    float densityWeight = pow(rawWeight, 0.4);

    // Pass to fragment shader
    vMagnitude = magnitude;
    vStereoWidth = stereoWidth;
    vHarmonicEnergy = harmonic;
    vTransientEnergy = transient;
    vFrequency = frequency;
    vNormFreq = normFreq;
    vAge = age;
    vHue = hue;
    vDensityWeight = densityWeight;

    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(xPos, yPos, zPos, 1.0);
    float magBoost = magnitude * magnitude * 0.4;
    float transientSizeBoost = transient * bassWeight * 0.15;  // Transients flash slightly larger
    float size = (uPointSize + magBoost + transientSizeBoost) * densityWeight;
    float perspScale = 200.0 / clipPos.w;
    gl_PointSize = clamp(size * perspScale, 1.0, 20.0);
    vPointSize = gl_PointSize;
    gl_Position = clipPos;
}
