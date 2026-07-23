#!/usr/bin/env node
// Automated visual regression test for Aurealis2.
//
// Launches headless Chrome, plays the reference test audio (index.html?ref),
// and captures a screenshot at each of the 7 checkpoint pauses.
//
// Prerequisites:
//   - npm install puppeteer   (in project root or globally)
//   - Web server running at localhost (default port 8080)
//   - test-reference.wav generated (see gen-test-audio.sh)
//
// Usage:
//   node Aurealis2/scripts/run-visual-tests.mjs [--port 8080] [--out /tmp]
//
// Output:
//   <out>/aurealis-cp1.png  through  aurealis-cp7.png

import puppeteer from 'puppeteer';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: opts } = parseArgs({
    options: {
        port: { type: 'string', default: '8080' },
        out:  { type: 'string', default: '/tmp' },
    },
});

const PORT = opts.port;
const OUT_DIR = opts.out;
const NUM_CHECKPOINTS = 7;

const browser = await puppeteer.launch({
    headless: 'new',
    args: [
        '--no-sandbox',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
        '--use-gl=angle',
        '--use-angle=swiftshader',
    ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

console.log('Loading reference test from localhost:' + PORT + '...');
await page.goto('http://localhost:' + PORT + '/index.html?ref', {
    waitUntil: 'networkidle0',
    timeout: 30000,
});

// Click to resume AudioContext (browser autoplay policy)
await new Promise(r => setTimeout(r, 2000));
await page.click('body');
await new Promise(r => setTimeout(r, 1000));

let passed = 0;
let failed = 0;

for (let i = 1; i <= NUM_CHECKPOINTS; i++) {
    process.stdout.write('Checkpoint ' + i + '/' + NUM_CHECKPOINTS + '... ');

    // Wait for the checkpoint overlay to appear
    try {
        await page.waitForFunction(
            () => document.getElementById('checkpoint-overlay')?.style.display === 'flex',
            { timeout: 20000 }
        );
    } catch (e) {
        console.log('TIMEOUT (overlay did not appear)');
        failed++;
        continue;
    }

    await new Promise(r => setTimeout(r, 500));

    const label = await page.evaluate(() => {
        const el = document.getElementById('checkpoint-label');
        return el ? el.textContent : 'unknown';
    });

    const outPath = path.join(OUT_DIR, 'aurealis-cp' + i + '.png');
    await page.screenshot({ path: outPath });
    console.log(label + ' -> ' + outPath);
    passed++;

    // Click overlay to advance to next checkpoint
    const overlay = await page.$('#checkpoint-overlay');
    if (overlay) {
        await overlay.click();
    } else {
        await page.click('body');
    }
    await new Promise(r => setTimeout(r, 500));
}

await browser.close();

console.log('');
console.log('Results: ' + passed + ' captured, ' + failed + ' failed');
console.log('Screenshots in: ' + OUT_DIR);

if (failed > 0) {
    process.exit(1);
}
