// UI control panel — wires HTML sliders/selects to renderer params and IPC.

/**
 * Initialize UI controls. Wires DOM elements to callbacks.
 * @param {Function} onParamChange - Called with (paramName, value) when a control changes
 * @param {Object} initialValues - Initial parameter values to set on controls
 */
export function initControls(onParamChange, initialValues = {}) {
    // Toggle panel visibility
    const toggle = document.getElementById('controls-toggle');
    const controls = document.getElementById('controls');
    if (toggle && controls) {
        toggle.addEventListener('click', () => {
            controls.classList.toggle('collapsed');
        });
    }

    // Wire up each control
    wireRange('color-tune', 'colorTune', onParamChange, initialValues, v => v.toFixed(2));
    wireRange('sensitivity', 'sensitivity', onParamChange, initialValues, v => v.toFixed(2));
    wireRange('time-depth', 'timeDepth', onParamChange, initialValues, v => Math.round(v).toString());
    wireRange('stereo-spread', 'stereoSpread', onParamChange, initialValues, v => v.toFixed(2));
    wireRange('z-spacing', 'zSpacing', onParamChange, initialValues, v => v.toFixed(2));
    wireRange('fade-depth', 'fadeDepth', onParamChange, initialValues, v => v.toFixed(2));

    // FFT Size select
    const fftSelect = document.getElementById('fft-size');
    if (fftSelect) {
        if (initialValues.fftSize !== undefined) {
            fftSelect.value = initialValues.fftSize.toString();
        }
        fftSelect.addEventListener('change', () => {
            onParamChange('fftSize', parseInt(fftSelect.value));
        });
    }

    // Audio source (standalone mode)
    const sourceSelect = document.getElementById('audio-source');
    const fileInput = document.getElementById('audio-file');
    if (sourceSelect && fileInput) {
        sourceSelect.addEventListener('change', () => {
            if (sourceSelect.value === 'file') {
                fileInput.style.display = 'block';
            } else {
                fileInput.style.display = 'none';
                onParamChange('audioSource', 'mic');
            }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                onParamChange('audioFile', fileInput.files[0]);
            }
        });
    }
}

function wireRange(elementId, paramName, onParamChange, initialValues, format) {
    const input = document.getElementById(elementId);
    const display = document.getElementById(elementId + '-val');
    if (!input) return;

    if (initialValues[paramName] !== undefined) {
        input.value = initialValues[paramName];
    }
    if (display) {
        display.textContent = format(parseFloat(input.value));
    }

    input.addEventListener('input', () => {
        const value = parseFloat(input.value);
        if (display) display.textContent = format(value);
        onParamChange(paramName, value);
    });
}

/**
 * Update a control's displayed value from external source (e.g., DAW automation).
 */
export function setControlValue(paramName, value) {
    const nameToId = {
        colorTune: 'color-tune',
        sensitivity: 'sensitivity',
        timeDepth: 'time-depth',
        stereoSpread: 'stereo-spread',
        zSpacing: 'z-spacing',
        fadeDepth: 'fade-depth',
        fftSize: 'fft-size',
    };

    const id = nameToId[paramName];
    if (!id) return;

    const input = document.getElementById(id);
    const display = document.getElementById(id + '-val');
    if (input) {
        input.value = value;
        if (display) {
            if (paramName === 'timeDepth') {
                display.textContent = Math.round(value).toString();
            } else if (paramName !== 'fftSize') {
                display.textContent = parseFloat(value).toFixed(2);
            }
        }
    }
}

/**
 * Update FPS counter.
 */
export function updateFPS(fps) {
    const el = document.getElementById('fps-counter');
    if (el) el.textContent = `${fps} fps`;
}

/**
 * Update time display with elapsed / duration.
 * @param {number} elapsed - Current playback position in seconds
 * @param {number} duration - Total duration in seconds (0 = unknown/live)
 */
export function updateTimeDisplay(elapsed, duration) {
    const el = document.getElementById('time-display');
    if (!el) return;

    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        const tenths = Math.floor((s % 1) * 10);
        return `${m}:${sec.toString().padStart(2, '0')}.${tenths}`;
    };

    if (duration > 0) {
        el.textContent = `${fmt(Math.max(0, elapsed))} / ${fmt(duration)}`;
    } else {
        el.textContent = fmt(Math.max(0, elapsed));
    }
}

/**
 * Update the source display in the info overlay.
 * @param {string} source - Source label (e.g., filename, "Microphone")
 */
export function updateSourceDisplay(source) {
    const el = document.getElementById('source-display');
    if (el) el.textContent = source;
}

/**
 * Show audio source controls (for standalone/web mode).
 */
export function showAudioSourceControls() {
    const group = document.getElementById('audio-source-group');
    if (group) group.style.display = 'flex';
}
