import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import webpush from 'web-push';

const SECRET = crypto.randomBytes(32).toString('hex');
const keys = webpush.generateVAPIDKeys();
Object.assign(process.env, {
  STORAGE_DRIVER: 'memory', DATA_DIR: '/virtual-data', VERCEL: '1',
  SESSION_SECRET: SECRET, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey,
  RP_ID: 'gym.test', ORIGIN: 'https://gym.test',
  COACH_DISABLED: '1', MEDIA_UPLOADS: '0', AUDIT_LOG: '0', ALLOW_GUEST: '0',
});
const { remoteStore } = await import('../fsbridge.js');
remoteStore.rows.set('db.json', {
  version: 1,
  body: JSON.stringify({ users: [{ id: 'u_1', name: 'Ronaldo' }], creds: [], subs: [], invites: [] }),
});
const { default: handler, serialize } = await import('../vercel-handler.js');

test('serialize runs one call at a time, in order, and a failure does not jam the queue', async () => {
  const order = [];
  const run = serialize(async (id, ms, fail) => {
    order.push('start ' + id);
    await new Promise(r => setTimeout(r, ms));
    order.push('end ' + id);
    if (fail) throw new Error('boom');
    return id;
  });
  const results = await Promise.allSettled([run(1, 30, true), run(2, 5), run(3, 1)]);
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].value, 2);
  assert.equal(results[2].value, 3);
});

function cookie(uid = 'u_1') {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `__Host-gymsid=${payload}.${mac}`;
}

async function call(method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    method, url,
    headers: { host: 'gym.test', ...(body == null ? {} : { 'content-type': 'application/json' }), ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  });
  return new Promise((resolve, reject) => {
    let status, hdrs;
    const res = {
      writeHead(s, h) { status = s; hdrs = h || {}; return this; },
      setHeader() {},
      end(b) {
        const text = b ? b.toString() : '';
        resolve({ status, headers: hdrs, json: text ? JSON.parse(text) : null });
        return this;
      },
    };
    handler(req, res).catch(reject);
  });
}

test('health answers from the remote data dir', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.users, 1);
});

test('a push lands in the remote as the state file, revision 1', async () => {
  const r = await call('PUT', '/api/data', {
    body: { state: { unit: 'kg', routines: [], workouts: [] }, baseRev: 0 },
    headers: { cookie: cookie() },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.rev, 1);
  const stored = JSON.parse(remoteStore.rows.get('state-u_1.json').body);
  assert.equal(stored._rev, 1);
  assert.equal(stored.unit, 'kg');
});

test('a conflict at commit time is retried and ends in the 409 the client already merges', async () => {
  const name = 'state-u_1.json';
  remoteStore.hooks.beforeWrite = async n => {
    if (n !== name) return;
    remoteStore.hooks.beforeWrite = null;           // the other device writes exactly once
    const row = remoteStore.rows.get(n);
    const doc = { ...JSON.parse(row.body), _rev: 2, unit: 'lb' };
    remoteStore.rows.set(n, { body: JSON.stringify(doc), version: row.version + 1 });
  };
  const r = await call('PUT', '/api/data', {
    body: { state: { unit: 'kg', routines: [], workouts: [] }, baseRev: 1 },
    headers: { cookie: cookie() },
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.state.unit, 'lb');
  assert.equal(JSON.parse(remoteStore.rows.get(name).body).unit, 'lb');
});

test('a write that keeps losing is a 503, and the client was never told it saved', async () => {
  const name = 'state-u_1.json';
  remoteStore.hooks.beforeWrite = async n => {
    if (n !== name) return;
    const row = remoteStore.rows.get(n);
    remoteStore.rows.set(n, { body: row.body, version: row.version + 1 });
  };
  const rev = JSON.parse(remoteStore.rows.get(name).body)._rev;
  const r = await call('PUT', '/api/data', {
    body: { state: { unit: 'kg', routines: [], workouts: [] }, baseRev: rev },
    headers: { cookie: cookie() },
  });
  remoteStore.hooks.beforeWrite = null;
  assert.equal(r.status, 503);
});

test('a pairing code created by one request is redeemed by another', async () => {
  const made = await call('POST', '/api/pair/create', { body: {}, headers: { cookie: cookie() } });
  assert.equal(made.status, 200);
  const redeemed = await call('POST', '/api/pair/redeem', { body: { code: made.json.code } });
  assert.equal(redeemed.status, 200);
  assert.equal(typeof redeemed.json.token, 'string');
  assert.equal(redeemed.json.user.id, 'u_1');
});

test('a pairing code written by another instance can be redeemed', async () => {
  const entries = [['ZZZZ2345', { uid: 'u_1', exp: Date.now() + 60000 }]];
  const row = remoteStore.rows.get('pairings.json');
  remoteStore.rows.set('pairings.json', { body: JSON.stringify(entries), version: (row?.version || 0) + 1 });
  const r = await call('POST', '/api/pair/redeem', { body: { code: 'ZZZZ2345' } });
  assert.equal(r.status, 200);
  assert.ok(!remoteStore.rows.get('pairings.json').body.includes('ZZZZ2345'));
});

test('expired pairing codes are pruned from the stored file on the next write', async () => {
  const row = remoteStore.rows.get('pairings.json');
  const entries = [['OLDC0DE2', { uid: 'u_9', exp: Date.now() - 1000 }]];
  remoteStore.rows.set('pairings.json', { body: JSON.stringify(entries), version: (row?.version || 0) + 1 });
  const made = await call('POST', '/api/pair/create', { body: {}, headers: { cookie: cookie() } });
  assert.equal(made.status, 200);
  const stored = remoteStore.rows.get('pairings.json').body;
  assert.ok(!stored.includes('OLDC0DE2'));
  assert.ok(stored.includes(made.json.code));
});

test('storage unreachable is a 503, never a 200', async () => {
  remoteStore.hooks.failList = true;
  const r = await call('GET', '/api/health');
  remoteStore.hooks.failList = false;
  assert.equal(r.status, 503);
});
