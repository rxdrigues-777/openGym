import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createVfs, ConflictError } from '../vfs.js';
import { createMemoryRemote } from '../remote-memory.js';

const DATA = path.resolve('/virtual-data');
const at = name => path.join(DATA, name);

async function fresh(remote = createMemoryRemote(), env = {}) {
  const v = createVfs({ dataDir: DATA, remote, env });
  await v.begin();
  return v;
}

test('an empty remote starts empty and reports ENOENT like the disk', async () => {
  const v = await fresh();
  assert.equal(v.fs.existsSync(at('db.json')), false);
  assert.throws(() => v.fs.readFileSync(at('db.json'), 'utf8'), e => e.code === 'ENOENT');
  assert.throws(() => v.fs.statSync(at('db.json')), e => e.code === 'ENOENT');
});

test('a write is visible at once and lands in the remote on commit, then updates bump the version', async () => {
  const remote = createMemoryRemote();
  const v = await fresh(remote);
  v.fs.writeFileSync(at('db.json'), '{"users":[]}');
  assert.equal(v.fs.readFileSync(at('db.json'), 'utf8'), '{"users":[]}');
  assert.equal(remote.rows.size, 0);
  await v.commit();
  assert.deepEqual(remote.rows.get('db.json'), { body: '{"users":[]}', version: 1 });
  v.atomicWrite(at('db.json'), '{"users":[1]}', 0o600);
  await v.commit();
  assert.deepEqual(remote.rows.get('db.json'), { body: '{"users":[1]}', version: 2 });
});

test('readFileSync without an encoding returns a Buffer, as node:fs does', async () => {
  const v = await fresh(createMemoryRemote({ 'a.json': 'x' }));
  assert.ok(Buffer.isBuffer(v.fs.readFileSync(at('a.json'))));
  assert.equal(v.fs.readFileSync(at('a.json'), { encoding: 'utf8' }), 'x');
});

test('two instances writing the same file: the second commit is a ConflictError naming it', async () => {
  const remote = createMemoryRemote({ 'state-u_1.json': '{"_rev":1}' });
  const a = await fresh(remote);
  const b = await fresh(remote);
  a.fs.writeFileSync(at('state-u_1.json'), '{"_rev":2,"from":"a"}');
  b.fs.writeFileSync(at('state-u_1.json'), '{"_rev":2,"from":"b"}');
  await a.commit();
  await assert.rejects(b.commit(), e => e instanceof ConflictError && e.file === 'state-u_1.json');
  assert.equal(JSON.parse(remote.rows.get('state-u_1.json').body).from, 'a');
});

test('state files are written before db.json, so a state conflict leaves db.json untouched', async () => {
  const remote = createMemoryRemote({ 'db.json': 'old', 'state-u_1.json': 's1' });
  const v = await fresh(remote);
  v.fs.writeFileSync(at('db.json'), 'new');
  v.fs.writeFileSync(at('state-u_1.json'), 's2');
  remote.rows.set('state-u_1.json', { body: 'other', version: 2 });
  await assert.rejects(v.commit(), ConflictError);
  assert.equal(remote.rows.get('db.json').body, 'old');
});

test('used-once tokens are committed last: a db.json conflict leaves challenges.json as it was', async () => {
  const remote = createMemoryRemote({ 'db.json': 'd1', 'challenges.json': '[["c1",{}]]' });
  const v = await fresh(remote);
  v.fs.writeFileSync(at('challenges.json'), '[]');   // the ceremony consumed its challenge…
  v.fs.writeFileSync(at('db.json'), 'd2');           // …then saved the account
  remote.rows.set('db.json', { body: 'other', version: 2 });
  await assert.rejects(v.commit(), e => e instanceof ConflictError && e.file === 'db.json');
  assert.equal(remote.rows.get('challenges.json').body, '[["c1",{}]]');
});

test('begin fetches only the rows whose version moved', async () => {
  const remote = createMemoryRemote({ 'db.json': 'a', 'state-u_1.json': 'b' });
  const asked = [];
  const get = remote.get;
  remote.get = async names => { asked.push([...names]); return get(names); };
  const v = await fresh(remote);
  assert.deepEqual(asked, [['db.json', 'state-u_1.json']]);
  remote.rows.set('db.json', { body: 'a2', version: 2 });
  const { changed } = await v.begin();
  assert.deepEqual(asked[1], ['db.json']);
  assert.deepEqual([...changed], ['db.json']);
  assert.equal(v.fs.readFileSync(at('db.json'), 'utf8'), 'a2');
});

test('a row deleted remotely disappears from the cache and counts as changed', async () => {
  const remote = createMemoryRemote({ 'pairings.json': '[]' });
  const v = await fresh(remote);
  remote.rows.delete('pairings.json');
  const { changed } = await v.begin();
  assert.ok(changed.has('pairings.json'));
  assert.equal(v.fs.existsSync(at('pairings.json')), false);
});

test('secret and vapid.json come from the environment and cannot be written', async () => {
  const v = await fresh(createMemoryRemote(), { SESSION_SECRET: 'abc', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
  assert.equal(v.fs.existsSync(at('secret')), true);
  assert.equal(v.fs.readFileSync(at('secret'), 'utf8'), 'abc');
  assert.deepEqual(JSON.parse(v.fs.readFileSync(at('vapid.json'), 'utf8')), { publicKey: 'pub', privateKey: 'priv' });
  assert.throws(() => v.fs.writeFileSync(at('secret'), 'x'), /environment/);
});

test('a missing SESSION_SECRET reads as an absent file', async () => {
  const v = await fresh();
  assert.equal(v.fs.existsSync(at('secret')), false);
});

test('statSync gives size in bytes and a version-based mtime', async () => {
  const v = await fresh(createMemoryRemote({ 'state-u_1.json': 'ção' }));
  const st = v.fs.statSync(at('state-u_1.json'));
  assert.equal(st.size, Buffer.byteLength('ção'));
  assert.equal(st.mtimeMs, 1);
});

test('unlink removes the row on commit; a probe written and unlinked costs no remote call', async () => {
  const remote = createMemoryRemote({ 'old.json': 'x' });
  const v = await fresh(remote);
  v.fs.unlinkSync(at('old.json'));
  let writes = 0;
  remote.hooks.beforeWrite = async () => { writes++; };
  v.fs.writeFileSync(at('.health-1'), '');
  v.fs.unlinkSync(at('.health-1'));
  await v.commit();
  assert.equal(remote.rows.has('old.json'), false);
  assert.equal(writes, 1);
  assert.throws(() => v.fs.unlinkSync(at('never.json')), e => e.code === 'ENOENT');
});

test('appendFileSync and copyFileSync work inside the data dir', async () => {
  const v = await fresh(createMemoryRemote({ 'db.json': '{}' }));
  v.fs.appendFileSync(at('audit.log'), 'a\n');
  v.fs.appendFileSync(at('audit.log'), 'b\n');
  v.fs.copyFileSync(at('db.json'), at('db.json.bak'));
  assert.equal(v.fs.readFileSync(at('audit.log'), 'utf8'), 'a\nb\n');
  assert.equal(v.fs.readFileSync(at('db.json.bak'), 'utf8'), '{}');
});

test('paths outside the data dir go to the real filesystem; mkdir/chmod of the data dir are no-ops', async () => {
  const v = await fresh();
  assert.equal(v.fs.existsSync(os.tmpdir()), true);
  assert.doesNotThrow(() => v.fs.mkdirSync(DATA, { recursive: true }));
  assert.doesNotThrow(() => v.fs.chmodSync(at('db.json'), 0o600));
  assert.equal(typeof v.fs.openSync, 'function');
});
