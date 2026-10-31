#!/usr/bin/env node
// Screenshot the visualizer playing a real audio file at given moments.
// Companion to probe-spectrum.mjs: that one gives numbers, this one gives pictures.
// Pass several ports to compare builds side by side (e.g. a worktree of the previous
// commit served on 8081 next to the working tree on 8080).
//
// Usage: node Aurealis2/scripts/capture-track.mjs <audio> [--ports 8080[,8081]] [--times 8,45,105] [--out /tmp] [--color-mode full|slice]
// Output: <out>/track-<port>-<t>s.png
// Prerequisites: npm install (puppeteer), web server(s) running, headless Chrome (SwiftShader ok).

import puppeteer from 'puppeteer';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        ports: { type: 'string', default: '8080' },
        times: { type: 'string', default: '8,45,105' },
        out:   { type: 'string', default: '/tmp' },
        'color-mode': { type: 'string' },   // full | slice (default: app default)
    },
});
const file = positionals[0];
if (!file) { console.error('usage: capture-track.mjs <audio> [--ports ..] [--times ..] [--out ..]'); process.exit(2); }
const ports = opts.ports.split(',');
const times = opts.times.split(',').map(Number).sort((a, b) => a - b);

async function run(port) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
               '--use-gl=angle', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('pageerror', (e) => console.error(`[${port}] PAGE ERROR`, e.message));
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('body');
    if (opts['color-mode']) await page.select('#color-mode', opts['color-mode']);
    const input = await page.$('#audio-file');
    await input.uploadFile(path.resolve(file));
    const t0 = Date.now();
    for (const t of times) {
        const wait = t * 1000 - (Date.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const shown = await page.evaluate(() => document.getElementById('time-display')?.textContent);
        const suffix = opts['color-mode'] ? `-${opts['color-mode']}` : '';
        const out = path.join(opts.out, `track-${port}-${t}s${suffix}.png`);
        await page.screenshot({ path: out });
        console.log(`[${port}] t=${t}s (page clock ${shown}) -> ${out}`);
    }
    await browser.close();
}
await Promise.all(ports.map(run));
