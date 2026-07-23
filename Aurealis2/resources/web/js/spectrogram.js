// 3D Spectrogram mesh + circular data buffer backed by DataTexture.
// Manages geometry (bin x time grid) and RGBA float texture.

import * as THREE from 'three';

const DEFAULT_NUM_BINS = 512;
const DEFAULT_TIME_DEPTH = 128;

export class SpectrogramDataBuffer {
    constructor(numBins = DEFAULT_NUM_BINS, timeDepth = DEFAULT_TIME_DEPTH) {
        this.numBins = numBins;
        this.timeDepth = timeDepth;
        this.writeIndex = 0;

        // RGBA float texture: R=magnitude, G=stereoWidth(remapped), B=harmonicEnergy, A=transient
        this.data = new Float32Array(numBins * timeDepth * 4);
        this.texture = new THREE.DataTexture(
            this.data,
            numBins,     // width = frequency bins
            timeDepth,   // height = time slices
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.needsUpdate = true;

        // Per-slice hue texture (timeDepth × 1, RGBA float, only R channel used)
        this.hueData = new Float32Array(timeDepth * 4);
        this.hueTexture = new THREE.DataTexture(
            this.hueData,
            timeDepth, 1,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.hueTexture.magFilter = THREE.NearestFilter;
        this.hueTexture.minFilter = THREE.NearestFilter;
        this.hueTexture.needsUpdate = true;
    }

    /**
     * Push one analysis frame into the circular buffer.
     * @param {Object} frame - { magnitudes, stereoWidth, harmonicEnergy, transientEnergy, numBins }
     */
    push(frame) {
        const offset = this.writeIndex * this.numBins * 4;
        const bins = Math.min(frame.numBins || this.numBins, this.numBins);

        for (let bin = 0; bin < bins; bin++) {
            const idx = offset + bin * 4;
            this.data[idx + 0] = frame.magnitudes[bin];                      // R: magnitude
            this.data[idx + 1] = (frame.stereoWidth[bin] + 1.0) * 0.5;      // G: stereo width (0=full L, 0.5=center, 1=full R)
            this.data[idx + 2] = frame.harmonicEnergy[bin];                  // B: harmonic energy
            this.data[idx + 3] = frame.transientEnergy;                      // A: transient energy
        }

        // Zero any remaining bins
        for (let bin = bins; bin < this.numBins; bin++) {
            const idx = offset + bin * 4;
            this.data[idx + 0] = 0;
            this.data[idx + 1] = 0.5;
            this.data[idx + 2] = 0;
            this.data[idx + 3] = 0;
        }

        // Store per-slice dominant hue
        if (frame.dominantHue !== undefined) {
            this.hueData[this.writeIndex * 4] = frame.dominantHue;
        }
        this.hueTexture.needsUpdate = true;

        this.texture.needsUpdate = true;
        this.writeIndex = (this.writeIndex + 1) % this.timeDepth;
    }

    getWriteIndex() {
        return this.writeIndex;
    }

    dispose() {
        this.texture.dispose();
        this.hueTexture.dispose();
    }
}

/**
 * Build the spectrogram grid geometry.
 * One vertex per (bin, timeSlice). Attributes: aBinIndex, aTimeIndex.
 * 512 bins x 128 time = 65536 point sprites, no index buffer. Single draw call.
 */
export function createSpectrogramGeometry(numBins = DEFAULT_NUM_BINS, timeDepth = DEFAULT_TIME_DEPTH) {
    const geometry = new THREE.BufferGeometry();

    const vertexCount = numBins * timeDepth;
    const positions = new Float32Array(vertexCount * 3);  // Placeholder, computed in vertex shader
    const binIndices = new Float32Array(vertexCount);
    const timeIndices = new Float32Array(vertexCount);

    for (let t = 0; t < timeDepth; t++) {
        for (let b = 0; b < numBins; b++) {
            const i = t * numBins + b;

            // Initial positions (will be overridden by vertex shader)
            positions[i * 3 + 0] = 0;  // X: stereo
            positions[i * 3 + 1] = b / numBins;  // Y: frequency (normalized)
            positions[i * 3 + 2] = -t;  // Z: time

            binIndices[i] = b;
            timeIndices[i] = t;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aBinIndex', new THREE.BufferAttribute(binIndices, 1));
    geometry.setAttribute('aTimeIndex', new THREE.BufferAttribute(timeIndices, 1));

    return geometry;
}
