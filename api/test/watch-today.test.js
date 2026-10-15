import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchToday, normalizeState } from '../watch.js';
import { buildSessionEntries } from '../../frontend/src/lib/session-start.js';

const DAY = '2026-10-15';          // a Thursday: getDay() === 4
const fixture = () => normalizeState({
  restSec: 75,
  routines: [
    { id: 'r1', name: 'Push A', ex: [
      { id: '0025', sets: 3, reps: 8, weight: 60, restSec: 90 },
      { id: '0047', sets: 2, reps: 10, weight: 20, warmupSets: 1 },
    ] },
    { id: 'r2', name: 'Pull B', ex: [{ id: 'c1', sets: 3, reps: 12, weight: 30 }] },
  ],
  week: { 4: ['r1'] },
  customEx: [{ id: 'c1', n: 'Remada na máquina do Zé', custom: true, eq: 'machine', bp: 'back' }],
  workouts: [{ id: 'w0', d: '2026-10-12', start: 1, end: 2, routineId: 'r1', routineIds: ['r1'],
    entries: [{ id: '0025', rid: 'r1', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }, { w: 60, r: 7, done: true }], topW: 60 }],
    prs: [] }],
});

test('the planned routine for the date is suggested and every routine is listed', () => {
  const t = buildWatchToday(fixture(), DAY);
  assert.equal(t.date, DAY);
  assert.equal(t.suggestedRoutineId, 'r1');
  assert.equal(t.unit, 'kg');
  assert.deepEqual(t.routines.map(r => [r.id, r.name]), [['r1', 'Push A'], ['r2', 'Pull B']]);
});

test('each exercise carries its name, rest, step, prescribed sets, last time and best', () => {
  const S = fixture();
  const [bench, raise] = buildWatchToday(S, DAY).routines[0].exercises;
  assert.equal(bench.name, 'Supino com barra');
  assert.equal(bench.restSec, 90);
  assert.equal(raise.restSec, 75);
  assert.equal(bench.inc, 2.5);
  const expected = buildSessionEntries(S, S.routines[0])[0].sets.map(x => x.w);
  assert.deepEqual(bench.sets.map(x => x.w), expected);
  assert.ok(bench.sets.every(x => x.warmup === false && x.r > 0));
  assert.deepEqual(bench.last, { w: 60, r: 8 });
  assert.equal(bench.best, 60);
  assert.equal(raise.sets[0].warmup, true);
  assert.equal(raise.last, null);
});

test('a custom exercise keeps the name the user gave it', () => {
  const t = buildWatchToday(fixture(), DAY);
  assert.equal(t.routines[1].exercises[0].name, 'Remada na máquina do Zé');
});

test('a day with nothing planned has no suggestion', () => {
  const t = buildWatchToday(fixture(), '2026-10-16');
  assert.equal(t.suggestedRoutineId, null);
  assert.equal(t.routines.length, 2);
});

test('an empty profile answers with no routines and no suggestion', () => {
  const t = buildWatchToday(normalizeState({}), DAY);
  assert.deepEqual(t, { date: DAY, suggestedRoutineId: null, unit: 'kg', routines: [] });
});
