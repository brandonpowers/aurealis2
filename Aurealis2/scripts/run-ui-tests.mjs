#!/usr/bin/env node
// UI state tests for the Aurealis2 web app. Companion to run-visual-tests.mjs
// (which verifies the DSP/render pipeline; this verifies chrome/UI states).
//
// Usage: node Aurealis2/scripts/run-ui-tests.mjs [--port 8080] [--out /tmp]
// Each test gets a fresh page. Screenshots land in <out>/ui-<slug>.png.

import puppeteer from 'puppeteer';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: opts } = parseArgs({
    options: {
        port: { type: 'string', default: '8080' },
        out:  { type: 'string', default: '/tmp' },
    },
});

const BASE = `http://localhost:${opts.port}`;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- tests --

test('page loads without errors and design tokens are defined', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    if (!accent) throw new Error('--accent token not defined on :root');
});

test('bundled fonts are loaded', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(async () => {
        await document.fonts.load('12px Inter');
        await document.fonts.load('12px "JetBrains Mono"');
        const loaded = (name) => [...document.fonts].some(
            (f) => f.family.replace(/["']/g, '') === name && f.status === 'loaded');
        return loaded('Inter') && loaded('JetBrains Mono');
    });
    if (!ok) throw new Error('Inter / JetBrains Mono @font-face not registered+loaded');
});

test('status strip contains wordmark, readouts, cameras, and gear', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    for (const sel of ['#status-strip .wordmark', '#status-strip #time-display',
                       '#status-strip #fps-counter', '#status-strip .cam-btn[data-view="front"]',
                       '#status-strip #controls-toggle']) {
        if (!(await page.$(sel))) throw new Error(`missing ${sel}`);
    }
});

test('settings panel opens with three grouped sections', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('#controls-toggle');
    const titles = await page.$$eval('#controls-panel .group-title',
        els => els.map(e => e.textContent.trim()));
    const want = ['Analysis', 'Geometry', 'Color'];
    for (const w of want) {
        if (!titles.includes(w)) throw new Error(`missing group "${w}" — got: ${titles.join(', ')}`);
    }
});

test('chrome auto-hides after idle and returns on mouse move', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.mouse.move(640, 360);
    await new Promise(r => setTimeout(r, 3600));
    if (!(await page.evaluate(() => document.body.classList.contains('ui-idle'))))
        throw new Error('ui-idle class not set after 3.6s');
    await page.mouse.move(660, 360);
    await new Promise(r => setTimeout(r, 200));
    if (await page.evaluate(() => document.body.classList.contains('ui-idle')))
        throw new Error('ui-idle not cleared on mouse move');
});

test('landing shows on default load with three actions', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    const visible = await page.evaluate(() => {
        const el = document.getElementById('landing');
        return el && getComputedStyle(el).display !== 'none';
    });
    if (!visible) throw new Error('#landing not visible');
    for (const sel of ['#landing-open-file', '#landing-use-mic', '#landing-play-demo']) {
        if (!(await page.$(sel))) throw new Error(`missing ${sel}`);
    }
});

test('play demo hides landing and starts playback', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('#landing-play-demo');
    await new Promise(r => setTimeout(r, 2500));
    const state = await page.evaluate(() => ({
        landingGone: getComputedStyle(document.getElementById('landing')).display === 'none',
        source: document.getElementById('source-display').textContent,
    }));
    if (!state.landingGone) throw new Error('landing still visible after demo click');
    if (!state.source.includes('demo')) throw new Error(`source display: "${state.source}"`);
});

test('ref mode skips the landing', async (page) => {
    await page.goto(`${BASE}/index.html?ref`, { waitUntil: 'networkidle0', timeout: 30000 });
    const display = await page.evaluate(() =>
        getComputedStyle(document.getElementById('landing')).display);
    if (display !== 'none') throw new Error('landing visible in ?ref mode');
});

test('keyboard: camera presets and chrome hide', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.keyboard.press('2');
    const frontActive = await page.$eval('.cam-btn[data-view="front"]',
        el => el.classList.contains('active'));
    if (!frontActive) throw new Error('key "2" did not activate front preset');
    await page.keyboard.press('h');
    if (!(await page.evaluate(() => document.body.classList.contains('ui-hidden'))))
        throw new Error('key "h" did not hide chrome');
    await page.keyboard.press('h');
    if (await page.evaluate(() => document.body.classList.contains('ui-hidden')))
        throw new Error('second "h" did not restore chrome');
});

test('help overlay toggles with ? and closes with Escape', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.keyboard.press('?');
    const vis = await page.evaluate(() =>
        getComputedStyle(document.getElementById('help-overlay')).display);
    if (vis === 'none') throw new Error('? did not open help');
    const rows = await page.$$eval('#help-overlay tbody tr', r => r.length);
    if (rows !== 7) throw new Error(`legend has ${rows} rows, want 7`);
    await page.keyboard.press('Escape');
    const gone = await page.evaluate(() =>
        getComputedStyle(document.getElementById('help-overlay')).display);
    if (gone !== 'none') throw new Error('Escape did not close help');
});

test('page metadata: title, description, favicon', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    const meta = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.content ?? '',
        icon: document.querySelector('link[rel="icon"]')?.href ?? '',
    }));
    if (!meta.title.startsWith('Aurealis')) throw new Error(`title: "${meta.title}"`);
    if (meta.desc.length < 30) throw new Error('description missing/too short');
    if (!meta.icon.endsWith('favicon.svg')) throw new Error('favicon link missing');
    const iconOk = await page.evaluate((url) => fetch(url).then(r => r.ok).catch(() => false), meta.icon);
    if (!iconOk) throw new Error('favicon does not load');
});

test('fft size and time depth controls actually apply', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('#landing-play-demo');
    await new Promise(r => setTimeout(r, 1500));
    await page.select('#fft-size', '0');
    await new Promise(r => setTimeout(r, 300));
    const fft = await page.evaluate(() => window.__aurealisDebug.getFFTSize());
    if (fft !== 2048) throw new Error(`fftSize uniform got ${fft}, want 2048`);
    await page.evaluate(() => {
        const el = document.getElementById('time-depth');
        el.value = '64';
        el.dispatchEvent(new Event('input'));
    });
    await new Promise(r => setTimeout(r, 300));
    const td = await page.evaluate(() => window.__aurealisDebug.getTimeDepth());
    if (td !== 64) throw new Error(`timeDepth buffer got ${td}, want 64`);
    const fps = await page.evaluate(() => window.__aurealisDebug.getFPS());
    if (!(fps > 0)) throw new Error('renderer stopped after control changes');
});

test('color mode select switches the shader mode and defaults to full', async (page) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('#landing-play-demo');
    await new Promise(r => setTimeout(r, 1500));
    const options = await page.$$eval('#color-mode option', els => els.map(e => e.value));
    if (options[0] !== 'full' || !options.includes('slice')) throw new Error(`color-mode options ${JSON.stringify(options)}`);
    const initial = await page.evaluate(() => window.__aurealisDebug.getColorMode());
    if (initial !== 'full') throw new Error(`default color mode ${initial}, want full`);
    await page.select('#color-mode', 'slice');
    await new Promise(r => setTimeout(r, 300));
    const mode = await page.evaluate(() => window.__aurealisDebug.getColorMode());
    if (mode !== 'slice') throw new Error(`color mode uniform got ${mode}, want slice`);
    const fps = await page.evaluate(() => window.__aurealisDebug.getFPS());
    if (!(fps > 0)) throw new Error('renderer stopped after color mode change');
});

// ---------------------------------------------------------------- runner --

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader',
           '--autoplay-policy=no-user-gesture-required',
           '--use-gl=angle', '--use-angle=swiftshader'],
});

let passed = 0, failed = 0;
for (const t of tests) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
        await t.fn(page);
        if (errors.length) throw new Error('page errors: ' + errors.join('; '));
        await page.screenshot({ path: path.join(opts.out, `ui-${slug(t.name)}.png`) });
        console.log(`PASS  ${t.name}`);
        passed++;
    } catch (e) {
        console.log(`FAIL  ${t.name}: ${e.message}`);
        failed++;
    }
    await page.close();
}
await browser.close();
console.log(`\nUI tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
