#!/usr/bin/env node
// Development server for the web app: serves Aurealis2/resources/web with
// Cache-Control: no-store on everything (Chrome otherwise reuses main.js and
// the .glsl shaders for days under a plain static server) and live-reloads
// open tabs when any file under the web directory changes. No dependencies.
//
// Usage: node Aurealis2/scripts/dev-server.mjs [--port 8080] [--no-reload]
//        npm run serve
//
// The reload hook is injected into index.html by the server only; the files
// on disk stay untouched, so the same tree still works inside the iPlug2 WebView.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
    options: {
        port:        { type: 'string',  default: '8080' },
        'no-reload': { type: 'boolean', default: false },
    },
});
const PORT = Number(opts.port);
const RELOAD = !opts['no-reload'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/web');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.glsl': 'text/plain; charset=utf-8', '.json': 'application/json', '.map': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};
const NO_CACHE = { 'Cache-Control': 'no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' };
const RELOAD_SNIPPET = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>\n`;

const clients = new Set();

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/__reload') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', ...NO_CACHE });
        res.write('retry: 500\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
    }

    let rel = decodeURIComponent(url.pathname);
    let file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403, NO_CACHE); return res.end('forbidden'); }
    try {
        if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    } catch { res.writeHead(404, NO_CACHE); return res.end('not found: ' + rel); }

    let body;
    try { body = fs.readFileSync(file); } catch { res.writeHead(404, NO_CACHE); return res.end('not found: ' + rel); }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    if (RELOAD && ext === '.html') {
        const html = body.toString('utf8');
        body = Buffer.from(html.includes('</body>') ? html.replace('</body>', RELOAD_SNIPPET + '</body>') : html + RELOAD_SNIPPET);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, ...NO_CACHE });
    res.end(req.method === 'HEAD' ? undefined : body);
});

if (RELOAD) {
    let timer = null;
    fs.watch(ROOT, { recursive: true }, (_event, filename) => {
        if (!filename || /(^|[\\/])\./.test(filename)) return;  // ignore dotfiles / editor temp files
        clearTimeout(timer);
        timer = setTimeout(() => {
            for (const c of clients) c.write('data: reload\n\n');
            console.log(`[dev-server] ${filename} changed → reload (${clients.size} tab${clients.size === 1 ? '' : 's'})`);
        }, 120);
    });
}

server.listen(PORT, () => {
    console.log(`[dev-server] http://localhost:${PORT}/  (root ${path.relative(process.cwd(), ROOT)}, no-store${RELOAD ? ', live reload' : ''})`);
});
