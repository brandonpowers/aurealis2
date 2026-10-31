// Pure analysis helpers shared by the Web Audio path (main.js) and the
// offline probe script. No DOM, no Three.js — unit-tested in tests/web/.
//
// dB convention: Web Audio AnalyserNode.getFloatFrequencyData — Blackman
// window, |X[k]| / fftSize, 20·log10. A full-scale sine peaks near -13 dB.
// The C++ StereoAnalyzer::LogScale uses the same floor and the same |X| / N
// normalisation; the prominence gate below is JS-only until the plugin path
// is revived (see TESTING.md).

// Visible dynamic range. Anything at or below the floor is treated as silence.
// Real recordings sit near -80 dB between notes; a loud mix peaks around -20 dB.
export const DB_FLOOR = -70;
export const DB_CEIL = 0;

// Below this mid magnitude a bin's L/R balance is mostly noise, so its stereo
// width is faded toward centre instead of fanning out into a V.
export const WIDTH_GATE_MAG = 0.2;

/**
 * Map an analyser dB value to a 0-1 magnitude, linear in dB.
 * -Infinity / NaN (digital silence) → 0.
 */
export function dbToMagnitude(db) {
    if (!(db > DB_FLOOR)) return 0;
    const m = (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR);
    return m < 1 ? m : 1;
}

/**
 * Signed stereo balance from per-channel dB levels, computed on linear
 * amplitude (matches the C++ StereoAnalyzer). -1 full left, 0 centre, +1 full
 * right. Signed square root expands small pans so a 6 dB pan reads as ~0.58.
 */
export function stereoBalance(dbL, dbR) {
    const aL = Number.isFinite(dbL) ? Math.pow(10, dbL / 20) : 0;
    const aR = Number.isFinite(dbR) ? Math.pow(10, dbR / 20) : 0;
    const sum = aL + aR;
    if (sum <= 0) return 0;
    const raw = (aR - aL) / sum;
    return Math.sign(raw) * Math.sqrt(Math.abs(raw));
}

/**
 * Stereo width for one bin: balance gated by the bin's mid magnitude so that
 * noise-floor bins collapse to centre.
 */
export function stereoWidthForBin(dbL, dbR, midMagnitude) {
    if (!(midMagnitude > 0)) return 0;
    const gate = midMagnitude >= WIDTH_GATE_MAG ? 1 : midMagnitude / WIDTH_GATE_MAG;
    return stereoBalance(dbL, dbR) * gate;
}

/**
 * Mid-channel magnitude from per-channel dB levels: average the linear
 * amplitudes first, then map to 0-1 (matches C++ StereoAnalyzer). A hard-panned
 * note is 6 dB below the same note centred, not half as bright.
 */
export function midMagnitudeFromDb(dbL, dbR) {
    const aL = Number.isFinite(dbL) ? Math.pow(10, dbL / 20) : 0;
    const aR = Number.isFinite(dbR) ? Math.pow(10, dbR / 20) : 0;
    const mid = (aL + aR) * 0.5;
    return mid > 0 ? dbToMagnitude(20 * Math.log10(mid)) : 0;
}

// ---- Spectral prominence gating ------------------------------------------
// Absolute level alone cannot separate "the notes" from the ambient bed under
// them: a quiet intro's reverb sits at -75 dB, a dense drop's at -63 dB, and
// any fixed floor is wrong for one of them. Perceptually, a component is heard
// when it stands above its spectral neighbourhood (masking). So each bin's
// magnitude is scaled by how far its dB level rises above the local mean over
// roughly ±¼ octave: partials are peaks and keep full magnitude, flat washes
// fade to GATE_FLOOR of theirs.

export const PROMINENCE_LO = 1;    // dB above the local mean where the gate starts to open
export const PROMINENCE_HI = 9;    // dB above the local mean where it is fully open
export const GATE_FLOOR = 0.15;    // residual magnitude factor for flat (non-prominent) content
export const PROM_MIN_HALF = 10;   // minimum half-window, bins
export const PROM_FRAC = 0.2;      // half-window as a fraction of bin index (≈ ±0.26 octave)
const PROM_CLAMP_DB = DB_FLOOR - 30;  // -Infinity bins count as this in the local mean

/**
 * Per-bin prominence in dB: level minus the mean level of its neighbourhood.
 * O(n) via prefix sums. `out` may be reused between frames.
 */
export function spectralProminence(db, out = new Float32Array(db.length)) {
    const n = db.length;
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
        const v = db[i] > PROM_CLAMP_DB ? db[i] : PROM_CLAMP_DB;
        pre[i + 1] = pre[i] + v;
    }
    for (let i = 0; i < n; i++) {
        const half = Math.max(PROM_MIN_HALF, Math.round(i * PROM_FRAC));
        const a = i - half > 0 ? i - half : 0;
        const b = i + half + 1 < n ? i + half + 1 : n;
        const base = (pre[b] - pre[a]) / (b - a);
        const v = db[i] > PROM_CLAMP_DB ? db[i] : PROM_CLAMP_DB;
        out[i] = v - base;
    }
    return out;
}

/** Smoothstep from GATE_FLOOR at PROMINENCE_LO to 1 at PROMINENCE_HI. */
export function prominenceGate(prominenceDb) {
    let t = (prominenceDb - PROMINENCE_LO) / (PROMINENCE_HI - PROMINENCE_LO);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = t * t * (3 - 2 * t);
    return GATE_FLOOR + (1 - GATE_FLOOR) * s;
}

let scratchMidDb = null;
let scratchProm = null;

/**
 * One analyser frame → per-bin magnitude and stereo width for the renderer.
 * dbL/dbR: getFloatFrequencyData arrays (dbR ignored when !hasStereo).
 * out: { magnitudes: Float32Array, stereoWidth: Float32Array } of length ≥ numBins.
 */
export function computeSpectrum(dbL, dbR, numBins, hasStereo, out) {
    if (!scratchMidDb || scratchMidDb.length !== numBins) {
        scratchMidDb = new Float32Array(numBins);
        scratchProm = new Float32Array(numBins);
    }
    const midDb = scratchMidDb;
    for (let i = 0; i < numBins; i++) {
        if (!hasStereo) { midDb[i] = dbL[i]; continue; }
        const aL = Number.isFinite(dbL[i]) ? Math.pow(10, dbL[i] / 20) : 0;
        const aR = Number.isFinite(dbR[i]) ? Math.pow(10, dbR[i] / 20) : 0;
        const mid = (aL + aR) * 0.5;
        midDb[i] = mid > 0 ? 20 * Math.log10(mid) : -Infinity;
    }
    const prom = spectralProminence(midDb, scratchProm);
    for (let i = 0; i < numBins; i++) {
        const m = dbToMagnitude(midDb[i]) * prominenceGate(prom[i]);
        out.magnitudes[i] = m;
        out.stereoWidth[i] = hasStereo ? stereoWidthForBin(dbL[i], dbR[i], m) : 0;
    }
    return out;
}

// ---- Dominant colour from spectral peaks ---------------------------------
// The whole cloud takes one hue per time slice: the aurealis hue of the
// strongest spectral peak, blended proportionally (linear amplitude) with the
// 2nd and 3rd peaks. Harmonics of a stronger peak are folded into it, so a
// single note with a rich spectrum is still one colour, and a chord is the
// weighted blend of its notes.

export const MAX_COLOR_PEAKS = 3;
export const PEAK_MIN_MAG = 0.05;         // gated magnitude below which a bin cannot be a peak
export const PEAK_MIN_RATIO = 0.1;        // peaks under 1/10 of the strongest amplitude (-20 dB) are ignored
export const PEAK_MIN_SEPARATION = 3;     // bins — same main lobe
export const HARMONIC_TOLERANCE = 0.03;   // ±3 % of k·f counts as the k-th harmonic
export const HARMONIC_MAX = 8;

/** 0-1 dB-linear magnitude back to linear amplitude (relative to 0 dB = 1). */
export function magnitudeToAmplitude(m) {
    return m > 0 ? Math.pow(10, (m - 1) * (DB_CEIL - DB_FLOOR) / 20) : 0;
}

/**
 * Strongest spectral peaks, harmonics folded into their fundamental.
 * Returns up to maxPeaks of { bin, freq, weight } sorted by weight (desc).
 * bin is parabolic-interpolated; weight is linear amplitude incl. folded harmonics.
 */
export function findSpectralPeaks(mags, numBins, sampleRate, fftSize, maxPeaks = MAX_COLOR_PEAKS) {
    const cands = [];
    for (let i = 1; i < numBins - 1; i++) {
        const b = mags[i];
        if (b < PEAK_MIN_MAG || !(b > mags[i - 1] && b >= mags[i + 1])) continue;
        const a = mags[i - 1], c = mags[i + 1];
        const denom = a - 2 * b + c;
        let off = denom !== 0 ? 0.5 * (a - c) / denom : 0;
        off = off < -0.5 ? -0.5 : off > 0.5 ? 0.5 : off;
        const bin = i + off;
        cands.push({ bin, freq: (bin + 1) * sampleRate / fftSize, weight: magnitudeToAmplitude(b) });
    }
    cands.sort((p, q) => q.weight - p.weight);
    if (!cands.length) return [];

    const peaks = [];
    const minWeight = cands[0].weight * PEAK_MIN_RATIO;
    for (const c of cands) {
        if (c.weight < minWeight) break;
        let owner = null, isSubharmonic = false;
        for (const p of peaks) {
            if (Math.abs(c.bin - p.bin) <= PEAK_MIN_SEPARATION) { owner = p; break; }
            const up = c.freq / p.freq, ku = Math.round(up);          // c is a harmonic of p
            if (ku >= 2 && ku <= HARMONIC_MAX && Math.abs(up - ku) <= HARMONIC_TOLERANCE * ku) { owner = p; break; }
            const down = p.freq / c.freq, kd = Math.round(down);      // c is the fundamental of p
            if (kd >= 2 && kd <= HARMONIC_MAX && Math.abs(down - kd) <= HARMONIC_TOLERANCE * kd) { owner = p; isSubharmonic = true; break; }
        }
        if (owner) {
            owner.weight += c.weight;
            if (isSubharmonic) { owner.bin = c.bin; owner.freq = c.freq; }  // re-anchor colour to the fundamental
        } else if (peaks.length < maxPeaks) {
            peaks.push({ bin: c.bin, freq: c.freq, weight: c.weight });
        }
    }
    peaks.sort((p, q) => q.weight - p.weight);
    return peaks;
}

/** Weighted circular mean of hues (0-1). strength = resultant length (0 = nothing / cancelled). */
export function blendHues(items) {
    let x = 0, y = 0, w = 0;
    for (const it of items) {
        const a = it.hue * 2 * Math.PI;
        x += Math.cos(a) * it.weight; y += Math.sin(a) * it.weight; w += it.weight;
    }
    if (w <= 0) return { hue: 0, strength: 0 };
    const r = Math.hypot(x, y) / w;
    const hue = ((Math.atan2(y, x) / (2 * Math.PI)) % 1 + 1) % 1;
    return { hue, strength: r };
}

/** aurealis hue (0-1) of a frequency: fractional octave above A4, rotated by colorTune. */
export function aurealisHue(freq, colorTune = 0) {
    return (((Math.log2(freq / 440) + colorTune) % 1) + 1) % 1;
}

/**
 * The frame's dominant colour: { hue, strength, peaks }.
 * strength 0 means silence — callers keep the previous colour.
 */
export function dominantHue(mags, numBins, sampleRate, fftSize, colorTune = 0) {
    const peaks = findSpectralPeaks(mags, numBins, sampleRate, fftSize);
    const r = blendHues(peaks.map((p) => ({ hue: aurealisHue(p.freq, colorTune), weight: p.weight })));
    return { hue: r.hue, strength: r.strength, peaks };
}
