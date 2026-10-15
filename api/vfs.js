// The files server.js keeps under DATA_DIR, served from a remote table instead of the disk.
//
// server.js reads and writes its data synchronously (fs.readFileSync, atomicWrite) and is built
// around that: the compare-and-write of PUT /api/data is atomic because nothing is awaited
// between the read and the write. A serverless function has no disk that outlives it, so this
// keeps the synchronous surface and moves the waiting to the edges of a request: begin() pulls
// what changed in the remote into a cache, the handler runs against the cache, and commit()
// pushes what it wrote, each row guarded by its version. A row someone else wrote in between is a
// ConflictError, and the caller (vercel-handler.js) runs the request again on fresh data.
import realFs from 'node:fs';
import path from 'node:path';

export class ConflictError extends Error {
  constructor(file) {
    super(`storage conflict on ${file}`);
    this.name = 'ConflictError';
    this.file = file;
  }
}

const enoent = p => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' });
const toText = data => (Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? ''));
const wantsString = enc => {
  const e = typeof enc === 'string' ? enc : enc?.encoding;
  return typeof e === 'string' && /^utf-?8$/i.test(e);
};
// Per-user documents first: they are the ones two devices race for, and a conflict there must
// stop the commit before db.json (bookkeeping such as lastPull) is written on its behalf. Then
// db.json, and only then everything else — challenges.json and pairings.json above all: a
// ceremony removes its used-once token before it saves the account, and if that save loses a
// race the rerun must still find the token, or the user is sent back to Face ID for nothing.
const rank = name => (name.startsWith('state-') ? 0 : name.startsWith('db.json') ? 1 : 2);
const commitOrder = (a, b) => rank(a[0]) - rank(b[0]);

export function createVfs({ dataDir, remote, env = {} }) {
  const root = path.resolve(dataDir);
  const cache = new Map();   // name -> { body, version }  (what the remote holds, as last seen)
  const dirty = new Map();   // name -> body | null       (written by this request; null = removed)
  const nameOf = p => (typeof p === 'string' && path.dirname(path.resolve(p)) === root ? path.basename(p) : null);

  // Secrets are deployment configuration, not data: never stored in the table.
  const virtual = {
    secret: () => env.SESSION_SECRET || null,
    'vapid.json': () => (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY })
      : null),
  };

  function current(name) {
    if (virtual[name]) return virtual[name]();
    if (dirty.has(name)) return dirty.get(name);
    return cache.has(name) ? cache.get(name).body : null;
  }
  function put(name, body) {
    if (virtual[name]) throw new Error(`${name} comes from the environment on this deployment`);
    dirty.set(name, body);
  }

  const own = {
    readFileSync(p, enc) {
      const name = nameOf(p);
      if (name == null) return realFs.readFileSync(p, enc);
      const body = current(name);
      if (body == null) throw enoent(p);
      return wantsString(enc) ? body : Buffer.from(body, 'utf8');
    },
    writeFileSync(p, data, opts) {
      const name = nameOf(p);
      if (name == null) return realFs.writeFileSync(p, data, opts);
      put(name, toText(data));
    },
    appendFileSync(p, data, opts) {
      const name = nameOf(p);
      if (name == null) return realFs.appendFileSync(p, data, opts);
      put(name, (current(name) ?? '') + toText(data));
    },
    existsSync(p) {
      const name = nameOf(p);
      if (name == null) return realFs.existsSync(p);
      return current(name) != null;
    },
    statSync(p, opts) {
      const name = nameOf(p);
      if (name == null) return realFs.statSync(p, opts);
      const body = current(name);
      if (body == null) throw enoent(p);
      // server.js keys its parsed-state cache on (mtimeMs, size); the row version is what moves.
      const mtimeMs = dirty.has(name) ? Date.now() : (cache.get(name)?.version ?? 0);
      return { mtimeMs, size: Buffer.byteLength(body), isFile: () => true, isDirectory: () => false };
    },
    unlinkSync(p) {
      const name = nameOf(p);
      if (name == null) return realFs.unlinkSync(p);
      if (current(name) == null) throw enoent(p);
      dirty.set(name, null);
    },
    copyFileSync(src, dst) {
      if (nameOf(src) == null && nameOf(dst) == null) return realFs.copyFileSync(src, dst);
      own.writeFileSync(dst, own.readFileSync(src, 'utf8'));
    },
    mkdirSync(p, opts) {
      if (path.resolve(p) === root) return undefined;
      return realFs.mkdirSync(p, opts);
    },
    chmodSync(p, mode) {
      if (nameOf(p) != null || path.resolve(p) === root) return undefined;
      return realFs.chmodSync(p, mode);
    },
  };
  const fs = new Proxy(own, { get: (target, key) => (key in target ? target[key] : realFs[key]) });

  async function begin() {
    dirty.clear();
    const listed = await remote.list();
    const seen = new Set(listed.map(r => r.name));
    const changed = new Set();
    for (const name of [...cache.keys()]) if (!seen.has(name)) { cache.delete(name); changed.add(name); }
    const stale = listed.filter(r => cache.get(r.name)?.version !== r.version).map(r => r.name);
    if (stale.length) {
      for (const row of await remote.get(stale)) {
        cache.set(row.name, { body: row.body, version: row.version });
        changed.add(row.name);
      }
    }
    return { changed };
  }

  async function commit() {
    const pending = [...dirty].sort(commitOrder);
    dirty.clear();
    for (const [name, body] of pending) {
      const had = cache.get(name);
      let ok;
      if (body == null) ok = had ? await remote.remove(name, had.version) : true;
      else if (!had) ok = await remote.insert(name, body);
      else if (had.body === body) ok = true;
      else ok = await remote.update(name, body, had.version);
      if (!ok) {
        cache.delete(name);              // next begin() fetches whatever the remote holds now
        throw new ConflictError(name);
      }
      if (body == null) cache.delete(name);
      else if (!had) cache.set(name, { body, version: 1 });
      else if (had.body !== body) cache.set(name, { body, version: had.version + 1 });
    }
  }

  return {
    fs,
    atomicWrite: (file, content) => fs.writeFileSync(file, content),
    begin,
    commit,
  };
}
