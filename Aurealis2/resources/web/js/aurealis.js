// Aurealis color algorithm — CPU-side JavaScript implementation.
// Mirrors the GLSL shader for UI previews and fallback rendering.
// Ported from ~/repos/aurealis/src/lib/color-utils.ts

const FREQ_MIN = 8.18;
const FREQ_MAX = 12543.85;
const FREQ_REF = 440.0;
const LOG_FREQ_MIN = Math.log(FREQ_MIN);
const LOG_FREQ_MAX = Math.log(FREQ_MAX);
const LOG_FREQ_RANGE = LOG_FREQ_MAX - LOG_FREQ_MIN;

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Core aurealis frequency-to-color mapping.
 * @param {number} frequency - Hz
 * @param {number} colorTune - 0-1 hue rotation offset
 * @returns {{ h: number, s: number, l: number }} HSL (h: 0-360, s: 0-1, l: 0-1)
 */
export function frequencyToColor(frequency, colorTune = 0) {
    if (frequency <= 0) return { h: 0, s: 1, l: 0.5 };

    // Lightness: log-scale position in audible range (0-1)
    const logFreq = Math.log(frequency);
    const lightness = Math.max(0, Math.min(1, (logFreq - LOG_FREQ_MIN) / LOG_FREQ_RANGE));

    // Hue: fractional octave relative to A4 (440Hz)
    const baseOctave = Math.log2(frequency / FREQ_REF);
    const hueRotation = baseOctave - Math.floor(baseOctave);

    // Final hue with color tuning, mapped to 0-360
    const hue = ((hueRotation + colorTune) % 1.0) * 360;

    return { h: hue, s: 1.0, l: lightness };
}

/**
 * Convert HSL to RGB. Matches the GLSL hslToRgb in spectrogram.frag.glsl.
 * @param {number} h - Hue 0-360
 * @param {number} s - Saturation 0-1
 * @param {number} l - Lightness 0-1
 * @returns {[number, number, number]} RGB 0-255
 */
export function hslToRgb(h, s, l) {
    h /= 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;

    let r, g, b;
    if (h < 1 / 6)      { r = c; g = x; b = 0; }
    else if (h < 2 / 6) { r = x; g = c; b = 0; }
    else if (h < 3 / 6) { r = 0; g = c; b = x; }
    else if (h < 4 / 6) { r = 0; g = x; b = c; }
    else if (h < 5 / 6) { r = x; g = 0; b = c; }
    else                 { r = c; g = 0; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

/**
 * Frequency to CSS color string.
 */
export function frequencyToCSS(frequency, colorTune = 0, alpha = 1) {
    const { h, s, l } = frequencyToColor(frequency, colorTune);
    if (alpha < 1) {
        return `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${alpha})`;
    }
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/**
 * FFT bin index to frequency.
 */
export function binToFrequency(bin, sampleRate, fftSize) {
    return (bin + 1) * sampleRate / fftSize;
}

/**
 * Frequency to note name + octave.
 */
export function frequencyToNote(frequency) {
    if (frequency <= 0) return { note: '—', octave: 0 };
    const midiNote = 12 * Math.log2(frequency / FREQ_REF) + 69;
    const rounded = Math.round(midiNote);
    const noteIndex = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return { note: NOTE_NAMES[noteIndex], octave };
}

export { FREQ_MIN, FREQ_MAX, FREQ_REF, NOTE_NAMES };
