#!/usr/bin/env node
// Measure real rendering FPS. Unlike run-visual-tests.mjs (SwiftShader software
// rendering, deliberately deterministic), this tries the actual GPU:
// headful Chrome when $DISPLAY exists, headless+EGL otherwise.
//
// Usage: node Aurealis2/scripts/measure-fps.mjs [--port 8080] [--seconds 12]

import puppeteer from 'puppeteer';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
    options: {
        port:    { type: 'string', default: '8080' },
        seconds: { type: 'string', default: '12' },
    },
});

const headful = !!process.env.DISPLAY;
const browser = await puppeteer.launch({
    headless: headful ? false : 'new',
    args: [
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        ...(headful ? [] : ['--use-gl=egl', '--enable-gpu', '--ignore-gpu-blocklist']),
    ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`http://localhost:${opts.port}/index.html`, { waitUntil: 'networkidle0' });
await page.click('#landing-play-demo');
await new Promise(r => setTimeout(r, 3000)); // warm-up

const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    const info = g?.getExtension('WEBGL_debug_renderer_info');
    return info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`Renderer: ${gl}  (${headful ? 'headful' : 'headless+egl'})`);

const samples = [];
const n = parseInt(opts.seconds, 10);
for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 1000));
    samples.push(await page.evaluate(() => window.__aurealisDebug.getFPS()));
}
await browser.close();

const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(`Samples: ${samples.join(' ')}`);
console.log(`Average: ${avg.toFixed(1)} fps   Min: ${Math.min(...samples)} fps`);
process.exit(avg >= 55 ? 0 : 1);
