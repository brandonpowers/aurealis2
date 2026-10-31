// Unit tests for the Web Audio analysis helpers (pure functions, no DOM).
// Run: npm test   (node --test tests/web/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DB_FLOOR,
    dbToMagnitude,
    stereoBalance,
    stereoWidthForBin,
    midMagnitudeFromDb,
    spectralProminence,
    prominenceGate,
    computeSpectrum,
    PROMINENCE_LO,
    PROMINENCE_HI,
    GATE_FLOOR,
    findSpectralPeaks,
    blendHues,
    dominantHue,
} from '../../Aurealis2/resources/web/js/analysis.js';

const close = (a, b, eps = 1e-6) =>
    assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

// ---- dbToMagnitude ------------------------------------------------------

test('a typical recording noise floor (-80 dB) maps to zero magnitude', () => {
    // Regression: the old (dB + 100) / 100 mapping put -80 dB at 0.2, which the
    // shader rendered at roughly a third of a loud note's brightness.
    assert.equal(dbToMagnitude(-80), 0);
});

test('the floor itself and anything below it map to zero', () => {
    assert.equal(dbToMagnitude(DB_FLOOR), 0);
    assert.equal(dbToMagnitude(DB_FLOOR - 30), 0);
});

test('digital silence (-Infinity from getFloatFrequencyData) maps to zero, not NaN', () => {
    assert.equal(dbToMagnitude(-Infinity), 0);
    assert.equal(dbToMagnitude(NaN), 0);
});

test('0 dB maps to one and louder clamps to one', () => {
    assert.equal(dbToMagnitude(0), 1);
    assert.equal(dbToMagnitude(6), 1);
});

test('mapping is linear in dB between floor and ceiling', () => {
    close(dbToMagnitude(DB_FLOOR / 2), 0.5);
});

// ---- stereoBalance ------------------------------------------------------

test('equal L and R levels are centered', () => {
    assert.equal(stereoBalance(-30, -30), 0);
});

test('balance is computed on linear amplitude: L 6 dB louder than R reads as sqrt(1/3) left', () => {
    // aL = 2 aR  ->  raw = (aR - aL)/(aL + aR) = -1/3  ->  signed sqrt = -0.577
    const a = Math.pow(10, -30 / 20);
    const dbR = 20 * Math.log10(a / 2);
    close(stereoBalance(-30, dbR), -Math.sqrt(1 / 3), 1e-6);
});

test('hard-left (right channel silent) is full negative width', () => {
    close(stereoBalance(-30, -Infinity), -1);
    close(stereoBalance(-Infinity, -30), 1);
});

test('both channels silent are centered, not NaN', () => {
    assert.equal(stereoBalance(-Infinity, -Infinity), 0);
});

// ---- stereoWidthForBin --------------------------------------------------

test('a bin below the magnitude floor has no stereo width even if L and R differ', () => {
    // Regression: noise-floor bins with random L/R imbalance fanned out into a V.
    assert.equal(stereoWidthForBin(-85, -78, dbToMagnitude(-81.5)), 0);
});

test('a loud bin keeps its full balance', () => {
    const mid = dbToMagnitude(-20);
    close(stereoWidthForBin(-20, -Infinity, mid), -1);
});

test('width fades in smoothly just above the floor', () => {
    const quiet = stereoWidthForBin(-60, -Infinity, dbToMagnitude(-60));
    const loud  = stereoWidthForBin(-20, -Infinity, dbToMagnitude(-20));
    assert.ok(quiet < 0 && quiet > -1, `quiet width should be partial, got ${quiet}`);
    assert.ok(Math.abs(quiet) < Math.abs(loud));
});

// ---- midMagnitudeFromDb -------------------------------------------------

test('mid magnitude of equal channels equals the mono mapping', () => {
    close(midMagnitudeFromDb(-30, -30), dbToMagnitude(-30));
});

test('mid magnitude is the linear-amplitude average, so a hard-panned note loses 6 dB, not half its brightness', () => {
    // (a + 0) / 2 → -6.02 dB relative; the old code averaged 0-1 magnitudes and halved it
    close(midMagnitudeFromDb(-20, -Infinity), dbToMagnitude(-20 - 20 * Math.log10(2)), 1e-6);
});

// ---- spectral prominence gating -----------------------------------------
// A bin is drawn in proportion to how far it stands above its spectral
// neighbourhood, not just its absolute level. Notes and their partials are
// peaks; reverb washes, ambience beds and dense noise are flat and fade out.

const flat = (db, n = 2048) => new Float32Array(n).fill(db);

test('a flat spectrum has zero prominence everywhere', () => {
    const prom = spectralProminence(flat(-60));
    for (let i = 0; i < prom.length; i += 97) close(prom[i], 0, 1e-6);
});

test('a lone peak 30 dB above a flat bed has high prominence; bins far from it have none', () => {
    const db = flat(-60); db[400] = -30;
    const prom = spectralProminence(db);
    assert.ok(prom[400] > 25, `peak prominence ${prom[400]}`);
    assert.ok(Math.abs(prom[1200]) < 1, `far bin prominence ${prom[1200]}`);
});

test('prominence gate is the floor at or below PROMINENCE_LO and one at or above PROMINENCE_HI', () => {
    close(prominenceGate(PROMINENCE_LO), GATE_FLOOR);
    close(prominenceGate(-20), GATE_FLOOR);
    close(prominenceGate(PROMINENCE_HI), 1);
    close(prominenceGate(40), 1);
    const mid = prominenceGate((PROMINENCE_LO + PROMINENCE_HI) / 2);
    assert.ok(mid > GATE_FLOOR && mid < 1);
});

test('computeSpectrum keeps a note at full magnitude and fades the ambient bed under it', () => {
    const n = 2048;
    const dbL = flat(-55, n), dbR = flat(-55, n);       // ambient bed: 15 dB above DB_FLOOR
    dbL[300] = -30; dbR[300] = -30;                       // the note
    const out = { magnitudes: new Float32Array(n), stereoWidth: new Float32Array(n) };
    computeSpectrum(dbL, dbR, n, true, out);
    close(out.magnitudes[300], dbToMagnitude(-30), 1e-6);
    const bed = out.magnitudes[1000];
    assert.ok(bed <= dbToMagnitude(-55) * GATE_FLOOR + 1e-6, `bed magnitude ${bed} not gated`);
    assert.ok(bed > 0, 'bed should still be faintly present, not hard-clipped');
});

test('computeSpectrum stereo width follows the gated magnitude', () => {
    const n = 2048;
    const dbL = flat(-55, n), dbR = flat(-61, n);        // bed 6 dB left-heavy
    dbL[300] = -30; dbR[300] = -Infinity;                 // hard-left note
    const out = { magnitudes: new Float32Array(n), stereoWidth: new Float32Array(n) };
    computeSpectrum(dbL, dbR, n, true, out);
    close(out.stereoWidth[300], -1, 1e-6);
    assert.ok(Math.abs(out.stereoWidth[1000]) < 0.1, `bed width ${out.stereoWidth[1000]} should be near centre`);
});

test('computeSpectrum in mono mode yields zero width', () => {
    const n = 64;
    const out = { magnitudes: new Float32Array(n), stereoWidth: new Float32Array(n) };
    computeSpectrum(flat(-30, n), null, n, false, out);
    for (let i = 0; i < n; i++) assert.equal(out.stereoWidth[i], 0);
});

// ---- dominant colour from spectral peaks --------------------------------
// The whole cloud takes one hue: the aurealis hue of the strongest peak,
// blended proportionally (by linear amplitude) with the 2nd and 3rd peaks.
// Harmonics of a stronger peak are folded into it, so one note = one colour.

const SR = 44100, FFT = 4096;
const binOf = (hz) => Math.round(hz * FFT / SR) ;
const hzOf = (bin) => (bin + 1) * SR / FFT;
const hueOf = (hz) => (((Math.log2(hz / 440) % 1) + 1) % 1);
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// Synthetic gated-magnitude spectrum: a 3-bin lobe per partial
function spectrum(partials, n = 2048) {
    const m = new Float32Array(n);
    for (const { bin, mag } of partials) {
        m[bin] = Math.max(m[bin], mag);
        m[bin - 1] = Math.max(m[bin - 1], mag * 0.6);
        m[bin + 1] = Math.max(m[bin + 1], mag * 0.6);
    }
    return m;
}

test('a single peak yields one peak at that bin', () => {
    const peaks = findSpectralPeaks(spectrum([{ bin: 300, mag: 0.8 }]), 2048, SR, FFT);
    assert.equal(peaks.length, 1);
    close(peaks[0].bin, 300, 0.01);
});

test('harmonics of the strongest peak are folded into it, not reported as separate peaks', () => {
    const f = 120;  // fundamental bin; 2nd and 3rd harmonics at (f+1)*2-1, (f+1)*3-1
    const peaks = findSpectralPeaks(spectrum([
        { bin: f, mag: 0.8 }, { bin: (f + 1) * 2 - 1, mag: 0.7 }, { bin: (f + 1) * 3 - 1, mag: 0.6 },
    ]), 2048, SR, FFT);
    assert.equal(peaks.length, 1, `expected one grouped peak, got ${JSON.stringify(peaks)}`);
    close(peaks[0].bin, f, 0.01);
});

test('three non-harmonic peaks come back strongest first, at most three', () => {
    const peaks = findSpectralPeaks(spectrum([
        { bin: binOf(261.6), mag: 0.7 }, { bin: binOf(329.6), mag: 0.9 }, { bin: binOf(392), mag: 0.8 }, { bin: binOf(1500), mag: 0.75 },
    ]), 2048, SR, FFT);
    assert.equal(peaks.length, 3);
    assert.ok(peaks[0].weight >= peaks[1].weight && peaks[1].weight >= peaks[2].weight);
    close(peaks[0].bin, binOf(329.6), 0.01);
});

test('peaks more than 20 dB under the strongest are ignored', () => {
    const peaks = findSpectralPeaks(spectrum([{ bin: 300, mag: 0.9 }, { bin: 900, mag: 0.5 }]), 2048, SR, FFT);
    assert.equal(peaks.length, 1);
});

test('blendHues of one hue is that hue', () => {
    const r = blendHues([{ hue: 0.3, weight: 1 }]);
    close(r.hue, 0.3);
    close(r.strength, 1);
});

test('blendHues takes the short way round the circle', () => {
    const r = blendHues([{ hue: 0.95, weight: 1 }, { hue: 0.05, weight: 1 }]);
    assert.ok(hueDist(r.hue, 0.0) < 1e-6, `got ${r.hue}`);
});

test('blendHues is proportional to weight', () => {
    const r = blendHues([{ hue: 0.0, weight: 3 }, { hue: 0.2, weight: 1 }]);
    assert.ok(r.hue > 0.03 && r.hue < 0.07, `got ${r.hue}`);
});

test('blendHues of nothing has zero strength', () => {
    assert.equal(blendHues([]).strength, 0);
});

test('dominantHue of one note is the aurealis hue of that note, even with its harmonics present', () => {
    const f = binOf(220);  // A3
    const mags = spectrum([{ bin: f, mag: 0.9 }, { bin: (f + 1) * 2 - 1, mag: 0.8 }, { bin: (f + 1) * 3 - 1, mag: 0.7 }]);
    const r = dominantHue(mags, 2048, SR, FFT, 0);
    assert.ok(hueDist(r.hue, hueOf(hzOf(f))) < 0.01, `hue ${r.hue} vs ${hueOf(hzOf(f))}`);
});

test('dominantHue of a chord sits between the notes, nearest the strongest', () => {
    const a = binOf(440), c = binOf(554.4);  // A4, C#5 → hues 0.0 and ≈0.33
    const r = dominantHue(spectrum([{ bin: a, mag: 1.0 }, { bin: c, mag: 0.9 }]), 2048, SR, FFT, 0);
    assert.ok(r.hue > 0.02 && r.hue < 0.16, `got ${r.hue}`);
});

test('dominantHue applies colorTune as a rotation', () => {
    const a = binOf(440);
    const r0 = dominantHue(spectrum([{ bin: a, mag: 1.0 }]), 2048, SR, FFT, 0);
    const r1 = dominantHue(spectrum([{ bin: a, mag: 1.0 }]), 2048, SR, FFT, 0.25);
    assert.ok(hueDist(r1.hue, r0.hue + 0.25) < 1e-6);
});

test('dominantHue of silence has zero strength so the caller keeps the previous colour', () => {
    assert.equal(dominantHue(new Float32Array(2048), 2048, SR, FFT, 0).strength, 0);
});
