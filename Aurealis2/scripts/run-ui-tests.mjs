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
