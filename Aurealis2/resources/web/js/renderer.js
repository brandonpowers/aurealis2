// Three.js scene, camera, render loop, and spectrogram material.
// Sets up the 3D environment and manages the render cycle.

import * as THREE from 'three';
import { SpectrogramDataBuffer, createSpectrogramGeometry } from './spectrogram.js';

// Inline shader sources (loaded at build time, or fetched at runtime)
const VERT_SHADER_URL = '../shaders/spectrogram.vert.glsl';
const FRAG_SHADER_URL = '../shaders/spectrogram.frag.glsl';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.spectrogramMesh = null;
        this.dataBuffer = null;
        this.uniforms = null;
        this.frameCount = 0;
        this.lastFPSTime = performance.now();
        this.fps = 60;
        this.isDisposed = false;

        // Configurable parameters
        this.params = {
            colorTune: 0.3,
            sensitivity: 3.5,
            stereoSpread: 3.0,
            zSpacing: 0.2,
            fadeDepth: 0.45,
            numBins: 512,
            timeDepth: 128,
            sampleRate: 44100,
            fftSize: 4096,
        };
    }

    async init() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 1);

        // Scene
        this.scene = new THREE.Scene();

        // Camera: perspective, 3/4 angle to see both the frequency wall and time depth
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
        this.camera.position.set(4, 5, 3);
        this.camera.lookAt(0, 3, -10);

        // Fog for depth atmosphere — fades distant slices to black
        // Gentle density: 50% fog at ~140 units (trail is only ~25 units deep)
        this.scene.fog = new THREE.FogExp2(0x000000, 0.005);

        // Load shaders
        const [vertShader, fragShader] = await Promise.all([
            this.loadShader(VERT_SHADER_URL),
            this.loadShader(FRAG_SHADER_URL),
        ]);

        // Data buffer (circular texture)
        this.dataBuffer = new SpectrogramDataBuffer(this.params.numBins, this.params.timeDepth);

        // Uniforms
        this.uniforms = {
            uDataTexture:  { value: this.dataBuffer.texture },
            uWriteIndex:   { value: 0 },
            uTimeDepth:    { value: this.params.timeDepth },
            uNumBins:      { value: this.params.numBins },
            uStereoSpread: { value: this.params.stereoSpread },
            uZSpacing:     { value: this.params.zSpacing },
            uFadeDepth:    { value: this.params.fadeDepth },
            uSampleRate:   { value: this.params.sampleRate },
            uFFTSize:      { value: this.params.fftSize },
            uColorTune:    { value: this.params.colorTune },
            uSensitivity:  { value: this.params.sensitivity },
            uHueTexture:   { value: this.dataBuffer.hueTexture },
            uDominantHue:  { value: 0.0 },
            uPointSize:    { value: 0.15 },
        };

        // Shader material
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertShader,
            fragmentShader: fragShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        // Geometry
        const geometry = createSpectrogramGeometry(this.params.numBins, this.params.timeDepth);

        // Mesh
        this.spectrogramMesh = new THREE.Points(geometry, material);
        this.scene.add(this.spectrogramMesh);

        // Handle resize
        this._onResize = () => this.onResize();
        window.addEventListener('resize', this._onResize);
    }

    async loadShader(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Shader fetch failed: ${url}`);
            return await response.text();
        } catch (e) {
            console.error('Failed to load shader:', url, e);
            // Return a minimal fallback shader
            if (url.includes('vert')) {
                return `
                    attribute float aBinIndex;
                    attribute float aTimeIndex;
                    varying float vMagnitude;
                    varying float vFrequency;
                    varying float vAge;
                    varying float vStereoWidth;
                    varying float vHarmonicEnergy;
                    varying float vTransientEnergy;
                    void main() {
                        vMagnitude = 0.0; vFrequency = 440.0; vAge = 0.0;
                        vStereoWidth = 0.0; vHarmonicEnergy = 0.0; vTransientEnergy = 0.0;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = 2.0;
                    }
                `;
            }
            return `
                precision highp float;
                varying float vMagnitude;
                void main() {
                    gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); // Error magenta
                }
            `;
        }
    }

    /**
     * Push an analysis frame into the data buffer. Called from main.js on new data.
     */
    pushFrame(frame) {
        if (!this.dataBuffer) return;
        this.dataBuffer.push(frame);
        this.uniforms.uWriteIndex.value = this.dataBuffer.getWriteIndex();
        if (frame.dominantHue !== undefined) {
            this.uniforms.uDominantHue.value = frame.dominantHue;
        }
    }

    /**
     * Update a parameter uniform.
     */
    setParam(name, value) {
        if (name === 'timeDepth') {
            const depth = Math.round(value);
            this.params.timeDepth = depth;
            if (this.dataBuffer && depth !== this.dataBuffer.timeDepth) {
                this.dataBuffer.dispose();
                this.dataBuffer = new SpectrogramDataBuffer(this.params.numBins, depth);
                this.uniforms.uDataTexture.value = this.dataBuffer.texture;
                this.uniforms.uHueTexture.value = this.dataBuffer.hueTexture;
                this.uniforms.uTimeDepth.value = depth;
                this.uniforms.uWriteIndex.value = 0;
                const old = this.spectrogramMesh.geometry;
                this.spectrogramMesh.geometry = createSpectrogramGeometry(this.params.numBins, depth);
                old.dispose();
            }
            return;
        }

        this.params[name] = value;
        const uniformMap = {
            colorTune: 'uColorTune',
            sensitivity: 'uSensitivity',
            stereoSpread: 'uStereoSpread',
            zSpacing: 'uZSpacing',
            fadeDepth: 'uFadeDepth',
            sampleRate: 'uSampleRate',
            fftSize: 'uFFTSize',
        };
        const u = uniformMap[name];
        if (u && this.uniforms && this.uniforms[u]) {
            this.uniforms[u].value = value;
        }
    }

    /**
     * Render one frame. Called from requestAnimationFrame loop.
     */
    render() {
        if (this.isDisposed || !this.renderer) return;

        this.renderer.render(this.scene, this.camera);

        // FPS counter
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFPSTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFPSTime = now;
        }
    }

    /**
     * Orbit camera by delta angles (radians). Simple euler-based orbit.
     */
    orbitCamera(deltaTheta, deltaPhi) {
        const target = new THREE.Vector3(0, 3, -10);
        const offset = this.camera.position.clone().sub(target);
        const r = offset.length();

        let theta = Math.atan2(offset.x, offset.z) + deltaTheta;
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / r))) - deltaPhi;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

        offset.x = r * Math.sin(phi) * Math.sin(theta);
        offset.y = r * Math.cos(phi);
        offset.z = r * Math.sin(phi) * Math.cos(theta);

        this.camera.position.copy(target).add(offset);
        this.camera.lookAt(target);
    }

    /**
     * Zoom camera (dolly in/out).
     */
    zoomCamera(delta) {
        const target = new THREE.Vector3(0, 3, -10);
        const offset = this.camera.position.clone().sub(target);
        const r = Math.max(2, Math.min(50, offset.length() + delta));
        offset.normalize().multiplyScalar(r);
        this.camera.position.copy(target).add(offset);
    }

    /**
     * Set camera to a named preset position.
     */
    setCameraPreset(name) {
        const target = new THREE.Vector3(0, 3, -10);
        const presets = {
            default: new THREE.Vector3(4, 5, 3),
            front:   new THREE.Vector3(0, 4, 6),
            side:    new THREE.Vector3(12, 4, -10),
        };
        const pos = presets[name];
        if (!pos) return;
        this.camera.position.copy(pos);
        this.camera.lookAt(target);
    }

    onResize() {
        if (!this.renderer || !this.camera) return;
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    getFPS() {
        return this.fps;
    }

    dispose() {
        this.isDisposed = true;
        window.removeEventListener('resize', this._onResize);
        if (this.spectrogramMesh) {
            this.spectrogramMesh.geometry.dispose();
            this.spectrogramMesh.material.dispose();
        }
        if (this.dataBuffer) this.dataBuffer.dispose();
        if (this.renderer) this.renderer.dispose();
    }
}
