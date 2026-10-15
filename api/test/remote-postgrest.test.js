import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgrestRemote } from '../remote-postgrest.js';

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body == null ? undefined : JSON.parse(init.body) });
    const [status, data] = answers.shift();
    return { status, text: async () => (data === undefined ? '' : JSON.stringify(data)) };
  };
  return { calls, fetchImpl };
}
const URL_ = 'https://abc.supabase.co';
const mk = f => createPostgrestRemote({ url: URL_ + '/', key: 'srv', fetchImpl: f.fetchImpl });

test('refuses to start without url or key', () => {
  assert.throws(() => createPostgrestRemote({ url: '', key: 'k' }), /SUPABASE_URL/);
  assert.throws(() => createPostgrestRemote({ url: URL_, key: '' }), /SUPABASE_URL/);
});

test('list asks for name and version with the service key', async () => {
  const f = fakeFetch([[200, [{ name: 'db.json', version: 3 }]]]);
  assert.deepEqual(await mk(f).list(), [{ name: 'db.json', version: 3 }]);
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(f.calls[0].url, `${URL_}/rest/v1/files?select=name,version`);
  assert.equal(f.calls[0].headers.apikey, 'srv');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer srv');
});

test('get filters by an in-list of quoted names, and skips the call for none', async () => {
  const f = fakeFetch([[200, [{ name: 'a', body: 'x', version: 1 }]]]);
  const r = mk(f);
  assert.deepEqual(await r.get([]), []);
  await r.get(['db.json', 'state-u_1.json']);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${URL_}/rest/v1/files?select=name,body,version&name=in.${encodeURIComponent('("db.json","state-u_1.json")')}`);
});

test('insert: 201 is true, 409 (already there) is false, anything else throws', async () => {
  const f = fakeFetch([[201], [409, { code: '23505' }], [500, { message: 'down' }]]);
  const r = mk(f);
  assert.equal(await r.insert('db.json', '{}'), true);
  assert.deepEqual(f.calls[0].body, { name: 'db.json', body: '{}', version: 1 });
  assert.equal(f.calls[0].headers.Prefer, 'return=minimal');
  assert.equal(await r.insert('db.json', '{}'), false);
  await assert.rejects(r.insert('db.json', '{}'), /supabase insert failed: HTTP 500/);
});

test('update is guarded by the version and true only when a row matched', async () => {
  const f = fakeFetch([[200, [{ name: 'db.json' }]], [200, []]]);
  const r = mk(f);
  assert.equal(await r.update('db.json', 'new', 4), true);
  assert.equal(f.calls[0].method, 'PATCH');
  assert.equal(f.calls[0].url, `${URL_}/rest/v1/files?name=eq.db.json&version=eq.4`);
  assert.equal(f.calls[0].body.version, 5);
  assert.equal(f.calls[0].body.body, 'new');
  assert.equal(f.calls[0].headers.Prefer, 'return=representation');
  assert.equal(await r.update('db.json', 'new', 4), false);
});

test('remove is guarded by the version too', async () => {
  const f = fakeFetch([[200, [{ name: 'x' }]], [200, []]]);
  const r = mk(f);
  assert.equal(await r.remove('x', 2), true);
  assert.equal(f.calls[0].method, 'DELETE');
  assert.equal(f.calls[0].url, `${URL_}/rest/v1/files?name=eq.x&version=eq.2`);
  assert.equal(await r.remove('x', 2), false);
});
