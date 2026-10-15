import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWatchWorkout, validateWatchWorkout, normalizeState } from '../watch.js';

const T0 = Date.UTC(2026, 9, 15, 21, 0);
const state = (extra = {}) => normalizeState({
  routines: [{ id: 'r1', name: 'Push A', ex: [
    { id: '0025', sets: 3, reps: 8, weight: 60 },
    { id: '0047', sets: 2, reps: 10, weight: 20 },
  ] }],
  bodyweight: [{ d: '2026-10-14', w: 81.5, t: 1 }],
  ...extra,
});
const payload = (extra = {}) => ({
  clientId: 'w-20261015-abc123', routineId: 'r1', date: '2026-10-15', start: T0, end: T0 + 3600000,
  entries: [{ exId: '0025', sets: [
    { w: 62.5, r: 8, at: T0 + 300000, durSec: 40 },
    { w: 62.5, r: 8, at: T0 + 500000, durSec: 41 },
    { w: 62.5, r: 7, at: T0 + 700000, durSec: 44 },
    { w: 60, r: 10, at: T0 + 900000, durSec: 50 },
  ] }],
  hr: { avg: 118, max: 164, zones: [5, 12, 20, 15, 3] }, kcal: 412,
  ...extra,
});

test('a watch workout is filed like an app one: sets, records, volume, weights and its watch data', () => {
  const S = state();
  const r = applyWatchWorkout(S, payload(), { now: T0 + 4000000 });
  assert.equal(r.status, 'added');
  assert.equal(S.workouts.length, 1);
  const w = S.workouts[0];
  assert.equal(w.id, r.workoutId);
  assert.equal(w.d, '2026-10-15');
  assert.equal(w.start, T0);
  assert.equal(w.end, T0 + 3600000);
  assert.equal(w.name, 'Push A');
  assert.deepEqual(w.routineIds, ['r1']);
  assert.equal(w.bw, 81.5);
  assert.deepEqual(w.entries.map(e => e.id), ['0025']);
  assert.equal(w.entries[0].sets.filter(x => x.done).length, 4);
  assert.deepEqual(w.entries[0].sets.map(x => [x.w, x.r]), [[62.5, 8], [62.5, 8], [62.5, 7], [60, 10]]);
  assert.deepEqual(w.prs, ['0025']);
  assert.deepEqual(S.exWeights['0025'], { w: 62.5, d: '2026-10-15' });
  assert.equal(w.vol, 62.5 * 8 * 2 + 62.5 * 7 + 60 * 10);
  assert.deepEqual(w.watch, {
    clientId: 'w-20261015-abc123', device: 'bip6',
    hr: { avg: 118, max: 164, zones: [5, 12, 20, 15, 3] }, kcal: 412,
    setSec: { '0025': [40, 41, 44, 50] },
  });
});

test('the same clientId twice keeps one workout', () => {
  const S = state();
  const first = applyWatchWorkout(S, payload(), { now: T0 + 4000000 });
  const again = applyWatchWorkout(S, payload(), { now: T0 + 5000000 });
  assert.equal(again.status, 'duplicate');
  assert.equal(again.workoutId, first.workoutId);
  assert.equal(S.workouts.length, 1);
});

test('a workout uploaded after a newer one is filed in its place', () => {
  const newer = { id: 'later', d: '2026-10-17', start: T0 + 2 * 864e5, end: T0 + 2 * 864e5 + 3600000,
    routineIds: ['r1'], entries: [{ id: '0025', sets: [{ w: 70, r: 5, done: true }], topW: 70 }], prs: ['0025'] };
  const S = state({ workouts: [newer] });
  applyWatchWorkout(S, payload(), { now: T0 + 3 * 864e5 });
  assert.deepEqual(S.workouts.map(w => w.d), ['2026-10-15', '2026-10-17']);
  assert.deepEqual(S.workouts[0].prs, ['0025']);
  assert.deepEqual(S.workouts[1].prs, ['0025']);
});

test('a routine deleted meanwhile still saves, as freestyle', () => {
  const S = state({ routines: [] });
  const r = applyWatchWorkout(S, payload(), { now: T0 + 4000000 });
  assert.equal(r.status, 'added');
  const w = S.workouts[0];
  assert.equal(w.name, 'Treino livre');
  assert.deepEqual(w.routineIds, []);
  assert.equal(w.entries[0].sets.length, 4);
});

test('exercises the watch never touched stay out; order follows the watch', () => {
  const S = state();
  const p = payload({ entries: [
    { exId: '0047', sets: [{ w: 20, r: 10, at: T0 + 100000 }] },
    { exId: '0025', sets: [{ w: 60, r: 8, at: T0 + 400000 }] },
  ] });
  applyWatchWorkout(S, p, { now: T0 + 4000000 });
  assert.deepEqual(S.workouts[0].entries.map(e => e.id), ['0047', '0025']);
});

test('malformed payloads are refused with the reason', () => {
  const ok = payload();
  assert.equal(validateWatchWorkout(ok), null);
  assert.match(validateWatchWorkout({ ...ok, clientId: '' }), /clientId/);
  assert.match(validateWatchWorkout({ ...ok, clientId: 'x'.repeat(65) }), /clientId/);
  assert.match(validateWatchWorkout({ ...ok, date: '15/10/2026' }), /date/);
  assert.match(validateWatchWorkout({ ...ok, end: ok.start - 1 }), /end/);
  assert.match(validateWatchWorkout({ ...ok, entries: 'x' }), /entries/);
  assert.match(validateWatchWorkout({ ...ok, entries: [{ exId: '0025', sets: 'x' }] }), /sets/);
  assert.match(validateWatchWorkout({ ...ok, entries: [{ exId: '0025', sets: [{ w: -1, r: 5, at: 1 }] }] }), /w/);
  assert.match(validateWatchWorkout(null), /body/);
});
