// Aurealis2 WebView entry point.
// Boots Three.js renderer, wires C++ ↔ JS IPC, manages render loop.
//
// Works in two modes:
//   1. Plugin mode (inside iPlug2 WebView): receives data via window.onAnalysisFrame()
//   2. Standalone/web mode: uses Web Audio API + mic/file input with local FFT

import { Renderer } from './renderer.js';
import { initControls, setControlValue, updateFPS, updateTimeDisplay, updateSourceDisplay, showAudioSourceControls } from './controls.js';
import { frequencyToNote } from './aurealis.js';

// ---- State ----
let renderer = null;
let isPluginMode = false;   // True if running inside iPlug2 WebView
let audioContext = null;
let analyserNode = null;   // Left channel (or mono fallback)
let analyserNodeR = null;  // Right channel (null if mono)
let mediaStream = null;
let animFrameId = null;
let playbackStartTime = null;  // audioContext.currentTime when playback started
let audioDuration = 0;         // Total duration in seconds (0 = live/unknown)
let checkpointIndex = 0;       // Next checkpoint to trigger
let checkpointPaused = false;  // True while waiting for click at a checkpoint

// Reference test checkpoints: pause at these times with verification instructions
const checkpoints = [
    { time: 3.0, label: '1/7 — 100 Hz sine, CENTER',
      expect: 'Bright line at the BOTTOM of the frequency range, centered on X axis. Should be clearly visible.',
      camera: 'Use FRONT view for best verification' },
    { time: 8.0, label: '2/7 — 1 kHz sine, CENTER',
      expect: 'Thin line at MID-HEIGHT. Centered on X. Brightness should be similar to the 100 Hz segment.',
      camera: 'FRONT view — compare height vs previous' },
    { time: 13.0, label: '3/7 — 4 kHz sine, CENTER',
      expect: 'Thin line in UPPER portion. Centered on X. Similar brightness to 100 Hz and 1 kHz.',
      camera: 'FRONT view — should be noticeably higher than 1 kHz' },
    { time: 18.0, label: '4/7 — 100 Hz sine, full LEFT',
      expect: 'Line at BOTTOM (same height as checkpoint 1) but shifted LEFT of center.',
      camera: 'FRONT view — verify it moved LEFT' },
    { time: 23.0, label: '5/7 — 100 Hz sine, full RIGHT',
      expect: 'Line at BOTTOM but shifted RIGHT of center. Mirror image of checkpoint 4.',
      camera: 'FRONT view — verify it moved RIGHT' },
    { time: 28.0, label: '6/7 — White noise, stereo',
      expect: 'Broad fill across ALL frequencies (bottom to top) and stereo spread (left to right).',
      camera: 'FRONT view — should fill most of the screen' },
    { time: 33.0, label: '7/7 — 80 Hz kick pattern @ 2 Hz',
      expect: 'Rhythmic PULSES at the bottom. Should flash on/off ~2 times per second.',
      camera: 'FRONT view — watch for pulsing rhythm' },
];

// ---- Idle chrome hide ----
const IDLE_MS = 3000;
let idleTimer = null;

function setupIdleHide() {
    // Deterministic screenshots: never hide chrome in reference-test mode
    if (new URLSearchParams(window.location.search).has('ref')) return;

    const wake = () => {
        document.body.classList.remove('ui-idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            // Keep chrome while the settings panel is open
            const controls = document.getElementById('controls');
            if (controls && !controls.classList.contains('collapsed')) { wake(); return; }
            document.body.classList.add('ui-idle');
        }, IDLE_MS);
    };
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(ev =>
        window.addEventListener(ev, wake, { passive: true }));
    wake();
}


// ---- Boot ----
async function boot() {
    const canvas = document.getElementById('visualizer');
    if (!canvas) {
        console.error('Canvas #visualizer not found');
        return;
    }

    renderer = new Renderer(canvas);
    await renderer.init();

    // Detect plugin mode: iPlug2 WebView sets window.IPlugSendMsg
    isPluginMode = typeof window.IPlugSendMsg === 'function';

    // Initialize UI controls
    initControls(onParamChange, {
        colorTune: 0.3,
        sensitivity: 3.5,
        timeDepth: 128,
        stereoSpread: 3.0,
        zSpacing: 0.2,
        fadeDepth: 0.45,
        fftSize: 1,  // 4096
    });

    // Set up camera controls (mouse drag / scroll)
    setupCameraControls(canvas);
    setupIdleHide();

    // Camera preset buttons
    document.querySelectorAll('.cam-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (renderer) renderer.setCameraPreset(view);
            document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    if (isPluginMode) {
        // Plugin mode: data arrives via window.onAnalysisFrame (called from C++)
        console.log('[Aurealis2] Plugin mode — waiting for analysis frames');
    } else {
        console.log('[Aurealis2] Standalone mode — starting Web Audio');
        showAudioSourceControls();
        const params = new URLSearchParams(window.location.search);
        if (params.has('ref')) {
            // Reference test mode: auto-load the checkpoint WAV, no landing
            setupCheckpointClick();
            const refUrl = new URL('../test-reference.wav', import.meta.url).href;
            await playAudioUrl(refUrl);
            if (audioContext && audioContext.state === 'suspended') {
                const resume = () => {
                    audioContext.resume();
                    document.removeEventListener('click', resume);
                };
                document.addEventListener('click', resume);
            }
        } else {
            checkpoints.length = 0;
            setupLanding();
        }
    }

    // Start render loop
    requestAnimationFrame(renderLoop);
}

// ---- Render Loop ----
function renderLoop() {
    if (!renderer) return;

    // In standalone mode, pull data from Web Audio analyser
    if (!isPluginMode && analyserNode) {
        pushWebAudioFrame();
    }

    renderer.render();

    // Update FPS display every second (renderer tracks this internally)
    updateFPS(renderer.getFPS());

    // Update time display and check for checkpoints
    if (audioContext && playbackStartTime !== null) {
        const elapsed = audioContext.currentTime - playbackStartTime;
        updateTimeDisplay(elapsed, audioDuration);

        // Checkpoint pause (only in ?ref mode)
        if (checkpoints.length > 0 && checkpointIndex < checkpoints.length && !checkpointPaused) {
            const cp = checkpoints[checkpointIndex];
            if (elapsed >= cp.time) {
                checkpointPaused = true;
                audioContext.suspend();
                showCheckpoint(cp);
            }
        }
    }

    animFrameId = requestAnimationFrame(renderLoop);
}

// ---- Checkpoint Overlay ----

function showCheckpoint(cp) {
    const overlay = document.getElementById('checkpoint-overlay');
    if (!overlay) return;
    document.getElementById('checkpoint-label').textContent = cp.label;
    document.getElementById('checkpoint-expect').textContent = cp.expect;
    document.getElementById('checkpoint-camera').textContent = cp.camera;
    overlay.style.display = 'flex';

    // Auto-switch to Front view for verification
    if (renderer) renderer.setCameraPreset('front');
    document.querySelectorAll('.cam-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === 'front');
    });
}

function setupCheckpointClick() {
    const overlay = document.getElementById('checkpoint-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', () => {
        if (!checkpointPaused) return;
        overlay.style.display = 'none';
        checkpointIndex++;
        checkpointPaused = false;
        if (audioContext) audioContext.resume();
    });
}

// ---- Landing ----
function showLanding() {
    const el = document.getElementById('landing');
    if (el) el.style.display = 'flex';
}

function hideLanding() {
    const el = document.getElementById('landing');
    if (el) el.style.display = 'none';
}

function setupLanding() {
    showLanding();
    const fileInput = document.getElementById('audio-file');

    document.getElementById('landing-open-file')?.addEventListener('click', () => {
        fileInput?.click();
    });
    document.getElementById('landing-use-mic')?.addEventListener('click', async () => {
        hideLanding();
        await startWebAudio();
    });
    document.getElementById('landing-play-demo')?.addEventListener('click', async () => {
        hideLanding();
        const demoUrl = new URL('../demo.m4a', import.meta.url).href;
        await playAudioUrl(demoUrl);
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    });

    // Drag & drop anywhere
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) {
            hideLanding();
            onParamChange('audioFile', file);
        }
    });
}

// ---- Plugin Mode: C++ → JS IPC ----

/**
 * Called from C++ via EvaluateJavaScript("window.onAnalysisFrame('base64...')").
 * Decodes base64-encoded AnalysisFrame struct and pushes to renderer.
 */
window.onAnalysisFrame = function(base64Data) {
    if (!renderer) return;

    const bytes = atob(base64Data);
    const buffer = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        view[i] = bytes.charCodeAt(i);
    }

    // Parse AnalysisFrame binary layout (must match C++ struct exactly)
    const floats = new Float32Array(buffer);
    const ints = new Int32Array(buffer);

    const MAX_NUM_BINS = 4096;  // MAX_FFT_SIZE / 2
    let offset = 0;

    const magnitudes = floats.subarray(offset, offset + MAX_NUM_BINS);
    offset += MAX_NUM_BINS;

    const stereoWidth = floats.subarray(offset, offset + MAX_NUM_BINS);
    offset += MAX_NUM_BINS;

    const harmonicEnergy = floats.subarray(offset, offset + MAX_NUM_BINS);
    offset += MAX_NUM_BINS;

    const transientEnergy = floats[offset++];

    const chroma = floats.subarray(offset, offset + 12);
    offset += 12;

    const chordIndex = ints[offset++];
    const chordConfidence = floats[offset++];
    const numBins = ints[offset++];

    // Update dominant hue for whole-visualization coloring
    const effectiveBins = numBins || 2048;
    const sr = renderer.params.sampleRate || 44100;
    const fft = renderer.params.fftSize || 4096;
    const ct = renderer.params.colorTune || 0.3;
    updateDominantHue(magnitudes, effectiveBins, sr, fft, ct);

    // Push to renderer (hue baked into per-slice texture)
    renderer.pushFrame({
        magnitudes,
        stereoWidth,
        harmonicEnergy,
        transientEnergy,
        numBins: effectiveBins,
        dominantHue: smoothedHue,
    });

};

/**
 * Called from C++ to sync parameter values (e.g., from DAW automation).
 */
window.onParamChange = function(paramId, value) {
    const paramNames = ['colorTune', 'sensitivity', 'fftSize', 'timeDepth',
                        'stereoSpread', 'zSpacing', 'fadeDepth'];
    const name = paramNames[paramId];
    if (name && renderer) {
        renderer.setParam(name, value);
        setControlValue(name, value);
    }
};

// ---- JS → C++ IPC (parameter changes from UI) ----
function onParamChange(paramName, value) {
    if (renderer) {
        renderer.setParam(paramName, value);
    }

    // Send to C++ host if in plugin mode
    if (isPluginMode && typeof window.IPlugSendMsg === 'function') {
        const paramIds = {
            colorTune: 0, sensitivity: 1, fftSize: 2, timeDepth: 3,
            stereoSpread: 4, zSpacing: 5, fadeDepth: 6,
        };
        const id = paramIds[paramName];
        if (id !== undefined) {
            window.IPlugSendMsg('PARAM', { id, value });
        }
    }

    // Handle audio source changes in standalone mode
    if (paramName === 'audioSource' && !isPluginMode) {
        if (value === 'mic') startWebAudio();
    }
    if (paramName === 'audioFile' && !isPluginMode) {
        hideLanding();
        // Clear reference test checkpoints when user loads a new file
        checkpoints.length = 0;
        checkpointIndex = 0;
        checkpointPaused = false;
        const cpOverlay = document.getElementById('checkpoint-overlay');
        if (cpOverlay) cpOverlay.style.display = 'none';
        playAudioFile(value);
    }
}

// ---- Standalone Mode: Web Audio API ----

async function startWebAudio() {
    hideLanding();
    try {
        // Disable reference test checkpoints when switching source
        checkpoints.length = 0;
        checkpointIndex = 0;
        checkpointPaused = false;

        if (audioContext) audioContext.close();

        audioContext = new AudioContext({ sampleRate: 44100 });
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const source = audioContext.createMediaStreamSource(mediaStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 4096;
        analyserNode.smoothingTimeConstant = 0.3;  // Raw data, we do our own smoothing

        source.connect(analyserNode);

        playbackStartTime = audioContext.currentTime;
        audioDuration = 0;  // Live mic — no known duration

        renderer.setParam('sampleRate', audioContext.sampleRate);
        renderer.setParam('fftSize', analyserNode.fftSize);

        updateSourceDisplay('Microphone');
        console.log('[Aurealis2] Mic connected, sampleRate:', audioContext.sampleRate);
    } catch (e) {
        console.warn('[Aurealis2] Mic access denied or unavailable:', e.message);
    }
}

async function playAudioFile(file) {
    try {
        if (audioContext) audioContext.close();

        audioContext = new AudioContext({ sampleRate: 44100 });
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        const fftSize = 4096;
        const smoothing = 0.3;

        if (audioBuffer.numberOfChannels >= 2) {
            // Stereo: split into L/R analysers
            const splitter = audioContext.createChannelSplitter(2);
            source.connect(splitter);

            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = fftSize;
            analyserNode.smoothingTimeConstant = smoothing;
            splitter.connect(analyserNode, 0);  // Left → analyserNode

            analyserNodeR = audioContext.createAnalyser();
            analyserNodeR.fftSize = fftSize;
            analyserNodeR.smoothingTimeConstant = smoothing;
            splitter.connect(analyserNodeR, 1);  // Right → analyserNodeR

            console.log('[Aurealis2] Stereo file — L/R analysers connected');
        } else {
            // Mono fallback
            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = fftSize;
            analyserNode.smoothingTimeConstant = smoothing;
            source.connect(analyserNode);
            analyserNodeR = null;
        }

        source.connect(audioContext.destination);
        source.start();

        playbackStartTime = audioContext.currentTime;
        audioDuration = audioBuffer.duration;

        renderer.setParam('sampleRate', audioContext.sampleRate);
        renderer.setParam('fftSize', fftSize);

        updateSourceDisplay(file.name);
        console.log('[Aurealis2] Playing audio file:', file.name);
    } catch (e) {
        console.error('[Aurealis2] Failed to load audio file:', e);
    }
}

// Loads bundled audio (demo track or reference test WAV) from a URL and
// routes it through the same playback path as a user-selected file.
async function playAudioUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], url.split('/').pop(), { type: blob.type });
        await playAudioFile(file);
    } catch (e) {
        console.warn('[Aurealis2] Could not auto-load test file, falling back to mic:', e.message);
        await startWebAudio();
    }
}

/**
 * Pull frequency data from Web Audio AnalyserNode and push as a frame.
 * Note: Web Audio AnalyserNode gives us mono magnitude only (no stereo, no phase).
 * For full stereo analysis, the C++ DSP is preferred.
 */
let prevWebAudioMags = null;
let freqDataR = null;
let smoothedHue = 0.0;  // EMA-smoothed dominant hue (shared across both paths)

/**
 * Simplified Harmonic Product Spectrum — JS port of HarmonicDetector.cpp.
 * For each bin, checks if harmonics 2x, 3x, 4x exist. Returns geometric mean
 * ratio as 0-1 harmonic energy (high = tonal, low = noise).
 */
function computeHarmonicEnergy(magnitudes, numBins, output) {
    const NUM_HARMONICS = 4;
    for (let i = 0; i < numBins; i++) {
        const fundamental = magnitudes[i];
        if (fundamental < 0.01) {
            output[i] = 0;
            continue;
        }

        let harmonicProduct = 1.0;
        let harmonicsFound = 0;

        for (let h = 2; h <= NUM_HARMONICS; h++) {
            const harmonicBin = i * h;
            if (harmonicBin >= numBins) break;
            harmonicProduct *= (magnitudes[harmonicBin] + 0.001);
            harmonicsFound++;
        }

        if (harmonicsFound === 0) {
            output[i] = 0;
            continue;
        }

        const geoMean = Math.pow(harmonicProduct, 1.0 / harmonicsFound);
        const ratio = geoMean / (fundamental + 0.001);
        output[i] = Math.min(Math.max(ratio, 0), 1);
    }
}

/**
 * Find the dominant frequency bin, compute its aurealis hue, and smooth
 * with circular EMA (shortest-path lerp on the hue circle).
 * Updates the smoothedHue global and pushes it to the renderer uniform.
 */
function updateDominantHue(magnitudes, numBins, sampleRate, fftSize, colorTune) {
    // Find peak bin
    let peakBin = 0;
    let peakMag = 0;
    for (let i = 1; i < numBins; i++) {
        if (magnitudes[i] > peakMag) {
            peakMag = magnitudes[i];
            peakBin = i;
        }
    }

    if (peakMag < 0.001) return;  // Silence — don't shift color

    const freq = (peakBin + 1) * sampleRate / fftSize;
    const newHue = ((Math.log2(freq / 440.0) % 1) + 1 + colorTune) % 1;

    // Circular EMA: take shortest path around the hue circle
    let diff = newHue - smoothedHue;
    if (diff > 0.5) diff -= 1.0;
    if (diff < -0.5) diff += 1.0;
    smoothedHue = ((smoothedHue + diff * 0.15) % 1 + 1) % 1;
}

function pushWebAudioFrame() {
    if (!analyserNode) return;

    const numBins = analyserNode.frequencyBinCount;
    const freqDataL = new Float32Array(numBins);
    analyserNode.getFloatFrequencyData(freqDataL);

    // Get right channel if available
    const hasStereo = analyserNodeR !== null;
    if (hasStereo) {
        if (!freqDataR || freqDataR.length !== numBins) freqDataR = new Float32Array(numBins);
        analyserNodeR.getFloatFrequencyData(freqDataR);
    }

    const magnitudes = new Float32Array(numBins);
    const stereoWidth = new Float32Array(numBins);
    const harmonicEnergy = new Float32Array(numBins);

    let bassFlux = 0;
    let fullFlux = 0;
    // Bass transient range: bins covering ~20-400 Hz
    const bassMaxBin = Math.min(Math.ceil(400 * analyserNode.fftSize / audioContext.sampleRate), numBins);

    for (let i = 0; i < numBins; i++) {
        const dbL = Math.max(-100, freqDataL[i]);
        const normL = (dbL + 100) / 100;
        const magL = normL;  // Linear; shader handles perceptual curve

        let magR = magL;
        if (hasStereo) {
            const dbR = Math.max(-100, freqDataR[i]);
            const normR = (dbR + 100) / 100;
            magR = normR;  // Linear; shader handles perceptual curve
        }

        // Mid magnitude (average of L and R)
        magnitudes[i] = (magL + magR) * 0.5;

        // Stereo width: signed balance -1 (full L) to +1 (full R)
        if (hasStereo) {
            const sum = magL + magR + 0.0001;
            const rawWidth = (magR - magL) / sum;
            stereoWidth[i] = Math.sign(rawWidth) * Math.sqrt(Math.abs(rawWidth));
        } else {
            stereoWidth[i] = 0;
        }

        // Spectral flux for transient detection
        if (prevWebAudioMags) {
            const diff = magnitudes[i] - prevWebAudioMags[i];
            if (diff > 0) {
                const d2 = diff * diff;
                fullFlux += d2;
                if (i < bassMaxBin) bassFlux += d2;
            }
        }
    }

    // Bass flux normalized over bass bins only (kick drums punch through)
    // Full flux normalized over all bins (hi-hats, snares)
    const bassNorm = Math.min(1, bassFlux / bassMaxBin * 800);
    const fullNorm = Math.min(1, fullFlux / numBins * 500);
    const flux = Math.max(bassNorm, fullNorm);

    // Compute harmonic energy (tonal vs noise detection)
    computeHarmonicEnergy(magnitudes, numBins, harmonicEnergy);

    if (!prevWebAudioMags) prevWebAudioMags = new Float32Array(numBins);
    prevWebAudioMags.set(magnitudes);

    // Update dominant hue for whole-visualization coloring
    const sr = audioContext ? audioContext.sampleRate : 44100;
    const fft = analyserNode ? analyserNode.fftSize : 4096;
    const ct = renderer.params.colorTune || 0.3;
    updateDominantHue(magnitudes, numBins, sr, fft, ct);

    renderer.pushFrame({
        magnitudes,
        stereoWidth,
        harmonicEnergy,
        transientEnergy: flux,
        numBins,
        dominantHue: smoothedHue,
    });
}

// ---- Camera Controls ----

function setupCameraControls(canvas) {
    let isDragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || !renderer) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        renderer.orbitCamera(-dx * 0.005, dy * 0.005);
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    canvas.addEventListener('wheel', (e) => {
        if (!renderer) return;
        e.preventDefault();
        renderer.zoomCamera(e.deltaY * 0.01);
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging && renderer) {
            const dx = e.touches[0].clientX - lastX;
            const dy = e.touches[0].clientY - lastY;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            renderer.orbitCamera(-dx * 0.005, dy * 0.005);
        } else if (e.touches.length === 2 && renderer) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            renderer.zoomCamera((lastTouchDist - dist) * 0.02);
            lastTouchDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isDragging = false; });
}

// ---- Start ----
boot().catch(e => console.error('[Aurealis2] Boot failed:', e));
