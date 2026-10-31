#!/usr/bin/env node
// Offline probe of the magnitude / stereo-width / alpha pipeline on a real
// audio file — gives numbers where there is no GPU to look at.
//
// Simulates Web Audio AnalyserNode (Blackman window, |X|/N, smoothing 0.3 at
// 60 fps), runs the real computeSpectrum() from js/analysis.js, then applies a copy of the
// spectrogram.frag.glsl alpha chain per bin. Prints, for each time, how many
// bins would be drawn, the brightness ratio between the loudest bin and the
// median bin, and the average stereo width of noise-floor bins — side by side
// with the pre-October-2026 "legacy" mapping ((dB + 100) / 100, ungated).
//
// Usage: node Aurealis2/scripts/probe-spectrum.mjs <audio> [t1 t2 ...]
//        (times in seconds; default: every 20 s)
// Requires ffmpeg on PATH.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeSpectrum, dominantHue } from '../resources/web/js/analysis.js';
import { frequencyToNote } from '../resources/web/js/aurealis.js';

const [file, ...timeArgs] = process.argv.slice(2);
if (!file) { console.error('usage: probe-spectrum.mjs <audio> [times...]'); process.exit(2); }

const SR = 44100, N = 4096, BINS = N / 2, SMOOTH = 0.3, FPS = 60, WARMUP_FRAMES = 20;
const SENS = 3.5, POINT = 0.15, CLIPW = 10;   // renderer defaults; clip w ≈ camera distance

const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 2 ** 31 });
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const duration = pcm.length / 2 / SR;
const times = timeArgs.length ? timeArgs.map(Number)
    : Array.from({ length: Math.floor(duration / 20) }, (_, i) => (i + 1) * 20).filter(t => t + 1 < duration);

const window_ = Float32Array.from({ length: N }, (_, i) =>
    0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N));

function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let j = 0; j < len / 2; j++) {
                const p = i + j, q = i + j + len / 2;
                const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
                re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
                const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
            }
        }
    }
}

// One analyser read for one channel at sample offset `start`: smoothed linear |X|/N
function analyse(channel, start, smoothed) {
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = (pcm[(start + i) * 2 + channel] || 0) * window_[i];
    fft(re, im);
    for (let k = 0; k < BINS; k++) {
        const m = Math.hypot(re[k], im[k]) / N;
        smoothed[k] = SMOOTH * smoothed[k] + (1 - SMOOTH) * m;
    }
}
const toDb = (m) => (m > 0 ? 20 * Math.log10(m) : -Infinity);

// Copy of main.js computeHarmonicEnergy (kept in sync by hand)
function harmonicEnergy(mags) {
    const out = new Float32Array(BINS);
    for (let i = 0; i < BINS; i++) {
        const f = mags[i]; if (f < 0.01) continue;
        let prod = 1, found = 0;
        for (let h = 2; h <= 4; h++) { const b = i * h; if (b >= BINS) break; prod *= mags[b] + 0.001; found++; }
        if (!found) continue;
        out[i] = Math.min(1, Math.max(0, Math.pow(prod, 1 / found) / (f + 0.001)));
    }
    return out;
}

// Copy of the vertex + fragment alpha chain at the sprite centre
function shaderAlpha(mag, bin, harmonic, transient, gated) {
    const binDelta = Math.log((bin + 2) / (bin + 1)), refBin = Math.floor(1000 * N / SR);
    const dw = Math.pow(Math.min(4, Math.max(0.1, binDelta / Math.log((refBin + 2) / (refBin + 1)))), 0.4);
    const size = (POINT + mag * mag * 0.4) * dw, ps = Math.min(20, Math.max(1, size * 200 / CLIPW));
    const present = gated ? Math.min(1, Math.max(0, mag / 0.15)) ** 2 * (3 - 2 * Math.min(1, mag / 0.15)) : 1;
    let a = Math.pow(mag, 1.5) * SENS + (transient * 0.8 + harmonic * 0.15) * present;
    a = a / (1 + a * 0.5); a *= dw; a = Math.min(1, a); a *= Math.sqrt(2 / Math.max(ps, 2));
    return a * 1.18;
}

// Legacy (pre-fix) mapping for comparison
const legacyMag = (db) => (Math.max(-100, db) + 100) / 100;
function legacyWidth(dbL, dbR) {
    const l = legacyMag(dbL), r = legacyMag(dbR), raw = (r - l) / (l + r + 0.0001);
    return Math.sign(raw) * Math.sqrt(Math.abs(raw));
}

function fluxOf(cur, prev, bassMaxBin, kBass, kFull) {
    let bass = 0, full = 0;
    for (let i = 0; i < BINS; i++) { const d = cur[i] - prev[i]; if (d > 0) { full += d * d; if (i < bassMaxBin) bass += d * d; } }
    return Math.max(Math.min(1, bass / bassMaxBin * kBass), Math.min(1, full / BINS * kFull));
}

const median = (arr) => Array.from(arr).sort((a, b) => a - b)[arr.length >> 1];
const bassMaxBin = Math.ceil(400 * N / SR);

console.log(`${path.basename(file)}  (${duration.toFixed(1)} s)  —  legacy = (dB+100)/100 ungated, new = js/analysis.js`);
console.log('time   peak dB  floor dB | drawn(legacy) drawn(new) | peak:median alpha legacy / new | floor |width| legacy / new | flux legacy / new');
for (const t of times) {
    const sL = new Float32Array(BINS), sR = new Float32Array(BINS);
    let prevLegacy = null, prevNew = null, fluxLegacy = 0, fluxNew = 0;
    let dbL, dbR, specNew;
    for (let f = WARMUP_FRAMES; f >= 0; f--) {
        const start = Math.floor((t - f / FPS) * SR);
        analyse(0, start, sL); analyse(1, start, sR);
        dbL = Float32Array.from(sL, toDb); dbR = Float32Array.from(sR, toDb);
        const magsLegacy = Float32Array.from({ length: BINS }, (_, i) => (legacyMag(dbL[i]) + legacyMag(dbR[i])) / 2);
        specNew = computeSpectrum(dbL, dbR, BINS, true, { magnitudes: new Float32Array(BINS), stereoWidth: new Float32Array(BINS) });
        const magsNew = specNew.magnitudes;
        if (prevLegacy) { fluxLegacy = fluxOf(magsLegacy, prevLegacy, bassMaxBin, 800, 500); fluxNew = fluxOf(magsNew, prevNew, bassMaxBin, 160, 100); }
        prevLegacy = magsLegacy; prevNew = magsNew;
    }
    const magsLegacy = prevLegacy, magsNew = prevNew;
    const midDb = Float32Array.from({ length: BINS }, (_, i) => toDb((Math.pow(10, dbL[i] / 20) + Math.pow(10, dbR[i] / 20)) / 2));
    let pk = 1; for (let k = 2; k < BINS; k++) if (midDb[k] > midDb[pk]) pk = k;
    const floorDb = median(Float32Array.from(midDb, v => Math.max(-120, v)));
    const hL = harmonicEnergy(magsLegacy), hN = harmonicEnergy(magsNew);
    const aL = Float32Array.from({ length: BINS }, (_, i) => shaderAlpha(magsLegacy[i], i, hL[i], fluxLegacy, false));
    const aN = Float32Array.from({ length: BINS }, (_, i) => shaderAlpha(magsNew[i], i, hN[i], fluxNew, true));
    const drawn = (a) => a.filter(v => v >= 0.015).length;
    const ratio = (a) => a[pk] / Math.max(median(a), 1e-4);
    // Noise-floor bins: more than 50 dB under the frame peak
    const floorBins = []; for (let i = 0; i < BINS; i++) if (midDb[i] < midDb[pk] - 50) floorBins.push(i);
    const meanAbs = (fn) => floorBins.length ? floorBins.reduce((s, i) => s + Math.abs(fn(i)), 0) / floorBins.length : 0;
    const wL = meanAbs(i => legacyWidth(dbL[i], dbR[i]));
    const wN = meanAbs(i => specNew.stereoWidth[i]);
    const r = (x) => (x > 999 ? '>999' : x.toFixed(1));
    const dh = dominantHue(magsNew, BINS, SR, N, 0);
    const peakDesc = dh.peaks.map(p => { const n = frequencyToNote(p.freq); return `${n.note}${n.octave} ${(p.weight / dh.peaks[0].weight).toFixed(2)}`; }).join(', ');
    console.log(`       colour: hue ${dh.hue.toFixed(2)} (strength ${dh.strength.toFixed(2)}) ← ${peakDesc || 'silence'}`);
    console.log(`${String(t).padStart(4)}s  ${midDb[pk].toFixed(1).padStart(6)}  ${floorDb.toFixed(1).padStart(7)} | ` +
        `${String(drawn(aL)).padStart(13)} ${String(drawn(aN)).padStart(10)} | ` +
        `${r(ratio(aL)).padStart(16)} / ${r(ratio(aN)).padEnd(6)} | ` +
        `${wL.toFixed(2).padStart(14)} / ${wN.toFixed(2).padEnd(6)} | ${fluxLegacy.toFixed(2)} / ${fluxNew.toFixed(2)}`);
}
