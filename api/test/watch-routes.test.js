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
remoteStore.rows.set('db.json', { version: 1,
  body: JSON.stringify({ users: [{ id: 'u_1', name: 'Ronaldo' }], creds: [], subs: [], invites: [] }) });
remoteStore.rows.set('state-u_1.json', { version: 1, body: JSON.stringify({
  _rev: 3, unit: 'kg', restSec: 60, week: { 4: ['r1'] }, dayPlan: {},
  routines: [{ id: 'r1', name: 'Push A', ex: [{ id: '0025', sets: 2, reps: 8, weight: 60 }] }],
  workouts: [],
}) });
const { default: handler } = await import('../vercel-handler.js');

function cookie() {
  const payload = `u_1:${Date.now() + 86400000}:0`;
  return `__Host-gymsid=${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
}
async function call(method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'gym.test', ...(body == null ? {} : { 'content-type': 'application/json' }), ...headers } });
  return new Promise((resolve, reject) => {
    let status;
    handler(req, { writeHead(s) { status = s; return this; }, setHeader() {},
      end(b) { const t = b ? b.toString() : ''; resolve({ status, json: t ? JSON.parse(t) : null }); return this; } }).catch(reject);
  });
}
let bearer;
const T0 = Date.UTC(2026, 9, 15, 21, 0);
const workout = { clientId: 'w-20261015-e2e001', routineId: 'r1', date: '2026-10-15', start: T0, end: T0 + 3000000,
  entries: [{ exId: '0025', sets: [{ w: 62.5, r: 8, at: T0 + 60000 }, { w: 62.5, r: 8, at: T0 + 200000 }] }],
  hr: { avg: 120, max: 160 }, kcal: 300 };

test('a paired watch token reaches the watch routes; without it they are 401', async () => {
  assert.equal((await call('GET', '/api/watch/today?date=2026-10-15')).status, 401);
  const made = await call('POST', '/api/pair/create', { body: {}, headers: { cookie: cookie() } });
  const redeemed = await call('POST', '/api/pair/redeem', { body: { code: made.json.code } });
  bearer = { authorization: `Bearer ${redeemed.json.token}` };
  const r = await call('GET', '/api/watch/today?date=2026-10-15', { headers: bearer });
  assert.equal(r.status, 200);
  assert.equal(r.json.suggestedRoutineId, 'r1');
  assert.equal(r.json.rev, 3);
  assert.equal(r.json.routines[0].exercises[0].name, 'Supino com barra');
  assert.equal(r.json.routines[0].exercises[0].restSec, 60);
});

test('today refuses a malformed date', async () => {
  const r = await call('GET', '/api/watch/today?date=amanha', { headers: bearer });
  assert.equal(r.status, 400);
});

test('an upload lands in the profile document, readable by the phone', async () => {
  const r = await call('POST', '/api/watch/workout', { body: workout, headers: bearer });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.rev > 3);
  const data = await call('GET', '/api/data', { headers: bearer });
  const w = data.json.state.workouts.find(x => x.id === r.json.workoutId);
  assert.equal(w.watch.clientId, workout.clientId);
  assert.deepEqual(w.prs, ['0025']);
  assert.ok(w._ts > 0 || data.json.state._ts > 0);
});

test('a resend is a 200 duplicate and the revision does not move', async () => {
  const before = (await call('GET', '/api/data/rev', { headers: bearer })).json.rev;
  const r = await call('POST', '/api/watch/workout', { body: workout, headers: bearer });
  assert.equal(r.status, 200);
  assert.equal(r.json.duplicate, true);
  assert.equal((await call('GET', '/api/data/rev', { headers: bearer })).json.rev, before);
});

test('a malformed upload is a 400 with the reason, and nothing is stored', async () => {
  const before = (await call('GET', '/api/data/rev', { headers: bearer })).json.rev;
  const r = await call('POST', '/api/watch/workout', { body: { ...workout, clientId: 'bad' }, headers: bearer });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /clientId/);
  assert.equal((await call('GET', '/api/data/rev', { headers: bearer })).json.rev, before);
});
