import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FileMap } from '../file-map.js';
import { createVfs } from '../vfs.js';
import { createMemoryRemote } from '../remote-memory.js';

const DATA = path.resolve('/virtual-data');
const FILE = path.join(DATA, 'challenges.json');

test('a FileMap entry written by one instance is read and removed by another', async () => {
  const remote = createMemoryRemote();
  const one = createVfs({ dataDir: DATA, remote });
  await one.begin();
  const m1 = new FileMap(one.fs, FILE);
  m1.set('cid1', { kind: 'login', exp: 123 });
  await one.commit();

  const two = createVfs({ dataDir: DATA, remote });
  await two.begin();
  const m2 = new FileMap(two.fs, FILE);
  assert.deepEqual(m2.get('cid1'), { kind: 'login', exp: 123 });
  assert.equal(m2.delete('cid1'), true);
  await two.commit();

  await one.begin();
  assert.equal(m1.has('cid1'), false);
  assert.equal(m1.size, 0);
});

test('iteration, keys and size see the stored entries; deleting while iterating is safe', async () => {
  const v = createVfs({ dataDir: DATA, remote: createMemoryRemote() });
  await v.begin();
  const m = new FileMap(v.fs, FILE);
  m.set('a', { uid: 'u1' }).set('b', { uid: 'u2' }).set('c', { uid: 'u1' });
  assert.equal(m.size, 3);
  for (const [k, val] of m) if (val.uid === 'u1') m.delete(k);
  assert.deepEqual([...m.keys()], ['b']);
  assert.equal(m.keys().next().value, 'b');
});

test('an absent file is an empty map', async () => {
  const v = createVfs({ dataDir: DATA, remote: createMemoryRemote() });
  await v.begin();
  const m = new FileMap(v.fs, FILE);
  assert.equal(m.get('x'), undefined);
  assert.equal(m.size, 0);
});
