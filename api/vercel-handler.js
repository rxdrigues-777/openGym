// server.js as a Vercel function. Each request: pull what changed from the remote data dir,
// run the original handler against it with the response held back, push what it wrote, and only
// then answer. A write that lost a race (ConflictError) runs the whole request once more on the
// fresh data — for PUT /api/data that second run is the 409 + current document the clients
// already merge. Storage that cannot be reached is a 503: a client must never hear "saved" for a
// write that is not stored.
import { Readable } from 'node:stream';
import { vfs } from './fsbridge.js';
import { ConflictError } from './vfs.js';

const ATTEMPTS = 2;
let server = null;

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// A fresh request object per attempt, replaying the body read once up front.
function replay(req, raw) {
  const r = Readable.from(raw.length ? [raw] : []);
  Object.assign(r, { method: req.method, url: req.url, headers: req.headers, socket: req.socket, complete: true });
  return r;
}

function heldResponse() {
  let status = 200, ended = false;
  const headers = {};
  const chunks = [];
  return {
    headersSent: false,
    get ended() { return ended; },
    get statusCode() { return status; },
    set statusCode(v) { status = v; },
    setHeader(k, v) { headers[k] = v; },
    getHeader(k) { return headers[k]; },
    removeHeader(k) { delete headers[k]; },
    writeHead(code, a, b) {
      status = code;
      const h = a && typeof a === 'object' ? a : b;
      if (h) Object.assign(headers, h);
      this.headersSent = true;
      return this;
    },
    write(c) { chunks.push(Buffer.from(c)); return true; },
    end(c) { if (c) chunks.push(Buffer.from(c)); this.headersSent = true; ended = true; return this; },
    on() { return this; },
    once() { return this; },
    sendTo(res) { res.writeHead(status, headers); res.end(Buffer.concat(chunks)); },
  };
}

function unavailable(res, error) {
  res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '1' });
  res.end(JSON.stringify({ error }));
}

// One request at a time per instance. The vfs cache and server.js's `db` are module-wide: a
// second request's begin() would clear the first one's pending writes, and its reloadDb() would
// swap `db` under it. vercel.json turns Fluid compute off so an instance never gets two requests
// at once; this keeps that true even if the setting is ever flipped.
export function serialize(fn) {
  let tail = Promise.resolve();
  return (...args) => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => {});
    return run;
  };
}

export default serialize(async function handler(req, res) {
  if (!vfs) throw new Error('vercel-handler needs STORAGE_DRIVER=supabase (or memory in tests)');
  const raw = await readRaw(req);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await vfs.begin();
      if (!server) server = await import('./server.js');   // first import reads db.json from the primed cache
      server.reloadDb();
      const out = heldResponse();
      await server.handleRequest(replay(req, raw), out);
      if (!out.ended) {
        out.writeHead(500, { 'Content-Type': 'application/json' });
        out.end(JSON.stringify({ error: 'server error' }));
      }
      await vfs.commit();
      return out.sendTo(res);
    } catch (e) {
      if (e instanceof ConflictError) { console.warn('storage conflict, retrying', e.file); continue; }
      console.error('storage unavailable', e);
      return unavailable(res, 'storage unavailable, try again');
    }
  }
  return unavailable(res, 'busy, try again');
});
