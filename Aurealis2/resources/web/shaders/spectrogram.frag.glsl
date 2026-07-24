// Aurealis2 spectrogram fragment shader.
// Implements the aurealis color algorithm:
//   Hue = per-bin musical pitch (log2(freq/440) computed in vertex shader)
//   Lightness = magnitude-driven (squared mag suppresses noise floor)
//   Saturation = harmonic energy (tonal = vivid, noise = pastel)
//   Alpha = magnitude * sensitivity + transient boost + harmonic boost
//
// Originally ported from ~/repos/aurealis/src/shaders/cylinderShader.ts

precision highp float;

uniform float uColorTune;     // 0-1 hue rotation
uniform float uSensitivity;   // Magnitude multiplier
uniform float uFadeDepth;     // Fade over time depth (0 = no fade, 1 = full fade)
varying float vMagnitude;
varying float vStereoWidth;
varying float vHarmonicEnergy;
varying float vTransientEnergy;
varying float vFrequency;
varying float vNormFreq;
varying float vAge;
varying float vHue;            // Per-slice dominant hue (baked at write time)
varying float vDensityWeight;  // Log-frequency density compensation
varying float vPointSize;

// HSL to RGB — exact port from aurealis v1 cylinderShader.ts
vec3 hslToRgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c / 2.0;
    vec3 rgb;

    if (h < 1.0/6.0)      rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);

    return rgb + m;
}

void main() {
    // Soft circular point sprite falloff
    vec2 pc = gl_PointCoord * 2.0 - 1.0;
    float dist = dot(pc, pc);
    if (dist > 1.0) discard;
    float sharpness = 1.8 + vHarmonicEnergy * 1.2;  // 1.8 (noise/soft) to 3.0 (tonal/crisp)
    float core = pow(1.0 - dist, sharpness);
    // Wide faint halo lobe — additive blending turns overlap into glow.
    // Kept small (0.18) so single points stay crisp; tonal content glows more.
    float halo = pow(1.0 - dist, 1.1) * (0.18 + vHarmonicEnergy * 0.10);
    float softEdge = core + halo;

    // Hue: per-bin aurealis formula (computed in vertex shader)
    float hue = vHue;

    // Lightness: magnitude-driven (squared mag suppresses noise floor glow)
    float mag2 = vMagnitude * vMagnitude;
    float lightness = 0.35 + mag2 * 0.3;
    lightness = clamp(lightness, 0.2, 0.7);

    // Saturation: tonal content is vivid, noise is pastel
    float saturation = 0.4 + vHarmonicEnergy * 0.6;

    // Color from aurealis algorithm
    vec3 color = hslToRgb(hue, saturation, lightness);

    // Squared magnitude suppresses noise floor while keeping real signal
    // (noise at -80dB: 0.04 → 0.0016, signal at -20dB: 0.64 → 0.41)
    float mag = pow(vMagnitude, 1.5);

    // Alpha: amplitude-based with harmonic and transient boosts
    float alpha = mag * uSensitivity
                + vTransientEnergy * 0.8
                + vHarmonicEnergy * 0.15;

    // Soft knee compression — prevents harsh clipping at high sensitivity
    alpha = alpha / (1.0 + alpha * 0.5);

    // Density compensation: reduce treble brightness from overlapping log-mapped bins
    alpha *= vDensityWeight;
    alpha = clamp(alpha, 0.0, 1.0);

    // Time-based fade: older slices fade out
    float timeFade = 1.0 - vAge * uFadeDepth;
    alpha *= clamp(timeFade, 0.0, 1.0);

    // Energy conservation: bigger points spread energy over more pixels
    // sqrt() softens the curve — prevents over-dimming narrow-band signals (pure tones)
    // while still compensating for dense broadband overlap
    alpha *= sqrt(2.0 / max(vPointSize, 2.0));

    // Point sprite soft edge
    alpha *= softEdge;

    // Discard near-transparent fragments (lowered threshold for soft edge attenuation)
    if (alpha < 0.015) discard;

    // Additive blending: SRC_ALPHA blend factor handles alpha scaling,
    // so output non-premultiplied color (premultiplying would square alpha)
    gl_FragColor = vec4(color, alpha);
}
