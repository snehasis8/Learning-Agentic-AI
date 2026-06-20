#!/usr/bin/env node
// Tiny dependency-free local server for the focus UI. Serves index.html and a
// small JSON API backed by the same markdown files the CLI uses (focus-core.mjs).
// Run: npm run focus:ui   →   http://localhost:4321

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import {
  getState, logSession, recordReview, toggleItem, getQuestions,
} from '../hooks/focus-core.mjs';

const PORT = Number(process.env.FOCUS_PORT) || 4321;
const htmlPath = new URL('./index.html', import.meta.url);

const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(htmlPath, 'utf8'));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, getState());
    }
    if (req.method === 'GET' && url.pathname === '/api/questions') {
      const r = getQuestions(url.searchParams.get('module'));
      return json(res, r.ok ? 200 : 404, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/log') {
      const b = await readBody(req);
      const r = logSession(b);
      return json(res, r.ok ? 200 : 400, { ...r, state: getState() });
    }
    if (req.method === 'POST' && url.pathname === '/api/review') {
      const b = await readBody(req);
      const r = recordReview(b.module, b.result);
      return json(res, r.ok ? 200 : 400, { ...r, state: getState() });
    }
    if (req.method === 'POST' && url.pathname === '/api/toggle') {
      const b = await readBody(req);
      const r = toggleItem(Number(b.index));
      return json(res, r.ok ? 200 : 400, { ...r, state: getState() });
    }
    json(res, 404, { ok: false, message: 'not found' });
  } catch (err) {
    json(res, 500, { ok: false, message: err.message });
  }
});

server.listen(PORT, () => {
  const addr = `http://localhost:${PORT}`;
  console.log(`🎯 Focus UI running at ${addr}  (Ctrl-C to stop)`);
  // Best-effort: open the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', addr] : [addr];
  execFile(opener, args, () => { /* ignore if no browser */ });
});
