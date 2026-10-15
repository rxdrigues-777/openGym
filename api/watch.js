// What the watch needs from a profile, and what it sends back, in openGym's own terms. Built on
// the frontend's pure helpers (frontend/src/lib) so the prescription the wrist shows and the
// records its workouts set are the app's, not a second implementation. Loaded on demand by
// watch-routes.js: the api Docker image does not ship frontend/, and only these routes need it.
import { createHash } from 'node:crypto';
import { effectiveRoutineIds, lastEntryFor, bestWeightFor, lastBW, modeOf, isPerSide } from '../frontend/src/lib/history.js';
import { buildCombinedEntries, deriveSessionName } from '../frontend/src/lib/session-merge.js';
import { finishIntoState } from '../frontend/src/lib/finish-workout.js';
import { buildSessionEntries } from '../frontend/src/lib/session-start.js';
import { weightIncrement } from '../frontend/src/lib/progression.js';
import { registerCustom, EXIDX } from '../frontend/src/lib/exercises.js';
import { isWarmupRow, isSideSet, syncSideAggregate } from '../frontend/src/lib/workout-model.js';
import PT_NAMES from '../frontend/src/exercise-names/pt-BR.js';

const DEFAULT_REST = 90;
const capital = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// A stored document carries only what was ever set; the app overlays its defaults (useStore DEF).
export function normalizeState(S) {
  return {
    routines: [], workouts: [], week: {}, dayPlan: {}, exWeights: {}, queue: null, rotation: null,
    bodyweight: [], customEx: [], unit: 'kg', ...S,
  };
}

export function exerciseName(S, id) {
  const own = (S.customEx || []).find(c => c && c.id === id);
  if (own) return own.n || own.name || String(id);
  return capital(PT_NAMES[id] || EXIDX[id]?.n || String(id));
}

function lastTop(S, exId, rid) {
  const last = lastEntryFor(S, exId, rid);
  const rows = (last?.sets || []).filter(x => x && x.done && !isWarmupRow(x) && x.w != null);
  if (!rows.length) return null;
  const top = rows.reduce((a, b) => (b.w > a.w || (b.w === a.w && (b.r || 0) > (a.r || 0)) ? b : a));
  return { w: top.w, r: top.r || 0 };
}

function watchSet(row) {
  const out = { w: Number(row.w) || 0, r: Number(row.r) || 0, warmup: isWarmupRow(row) };
  const sec = row.sec ?? (isSideSet(row) ? row.sides.L.sec : undefined);
  if (sec != null) out.sec = Number(sec) || 0;
  else if (row.min != null) out.sec = Math.round((Number(row.min) || 0) * 60);
  return out;
}

export function buildWatchToday(S, iso) {
  registerCustom(S.customEx);
  const routines = (S.routines || []).filter(r => r && Array.isArray(r.ex)).map(r => {
    const entries = buildSessionEntries(S, r);
    return {
      id: r.id,
      name: r.name || 'Treino',
      exercises: entries.map((e, i) => {
        const cfg = r.ex[i] || {};
        return {
          id: e.id,
          name: exerciseName(S, e.id),
          restSec: Number(cfg.restSec) > 0 ? Number(cfg.restSec) : (Number(S.restSec) > 0 ? Number(S.restSec) : DEFAULT_REST),
          inc: weightIncrement(cfg, S.unit || 'kg'),
          // 'reps', 'time' (a hold: `sec`) or 'cardio' (`min`, sent as seconds too); per side: the
          // reps are the total of both sides, the way the app counts them, and split on the way back.
          mode: modeOf(cfg),
          perSide: isPerSide(cfg),
          sets: (e.sets || []).map(row => watchSet(row)),
          last: lastTop(S, e.id, r.id),
          best: bestWeightFor(S, e.id) || 0,
        };
      }),
    };
  });
  const planned = routines.length ? effectiveRoutineIds(S, iso, iso) : [];
  return { date: iso, suggestedRoutineId: planned[0] ?? null, unit: S.unit || 'kg', routines };
}

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = v => typeof v === 'number' && Number.isFinite(v);

export function validateWatchWorkout(p) {
  if (!p || typeof p !== 'object') return 'body must be a workout object';
  if (typeof p.clientId !== 'string' || !CLIENT_ID.test(p.clientId)) return 'clientId must be 8-64 letters, digits, _ or -';
  if (typeof p.date !== 'string' || !ISO_DATE.test(p.date)) return 'date must be YYYY-MM-DD';
  if (!num(p.start) || !num(p.end)) return 'start and end must be timestamps';
  if (p.end < p.start) return 'end is before start';
  if (p.routineId != null && typeof p.routineId !== 'string') return 'routineId must be a string or null';
  if (!Array.isArray(p.entries)) return 'entries must be a list';
  for (const e of p.entries) {
    if (!e || typeof e.exId !== 'string' || !e.exId) return 'each entry needs an exId';
    if (!Array.isArray(e.sets)) return `sets of ${e.exId} must be a list`;
    for (const x of e.sets) {
      if (!x || !num(x.w) || x.w < 0) return `w of a set of ${e.exId} must be a number >= 0`;
      if (!Number.isInteger(x.r) || x.r < 0) return `r of a set of ${e.exId} must be a whole number >= 0`;
      if (!num(x.at)) return `at of a set of ${e.exId} must be a timestamp`;
      if (x.warmup != null && typeof x.warmup !== 'boolean') return `warmup of a set of ${e.exId} must be true or false`;
      if (x.durSec != null && (!num(x.durSec) || x.durSec < 0)) return `durSec of a set of ${e.exId} must be a number >= 0`;
    }
  }
  return null;
}

// The session the watch trained, rebuilt the way the app starts one (buildCombinedEntries) and
// then filled with what was logged: the k-th set sent is the k-th row of the prescription the
// watch was given (warm-ups included), anything past it an extra set. Exercises the watch never
// touched stay unchecked and so out of the saved workout, as on the phone.
// One logged set onto the row the app built for it. A per-side row is done only when both of its
// sides are (hasCompletedWork), so the watch's total goes to each side by half; a hold or a cardio
// row keeps the time actually done; the watch's own warm-up flag decides the phase, so a routine
// edited on the phone between download and training cannot turn a work set into a warm-up.
function filledRow(row, x) {
  let out;
  if (isSideSet(row)) {
    const side = s => ({ ...s, w: x.w, r: x.r / 2, done: true,
      ...(s.sec != null && num(x.durSec) ? { sec: Math.round(x.durSec) } : {}) });
    out = syncSideAggregate({ ...row, sides: { L: side(row.sides.L), R: side(row.sides.R) } });
  } else {
    out = { ...row, w: x.w, r: x.r, done: true };
    if (num(x.durSec) && row.sec != null) out.sec = Math.round(x.durSec);
    if (num(x.durSec) && row.min != null) out.min = Math.round(x.durSec / 6) / 10;
  }
  if (typeof x.warmup === 'boolean') {
    if (x.warmup) out.phase = 'warmup';
    else if (isWarmupRow(out)) { out.phase = 'work'; delete out.warmup; }
  }
  out.at = x.at;
  return out;
}

// The workout's id: derived from the whole clientId (a resend finds the same one), and never one
// already in history, so two uploads can never collapse into one record when devices merge by id.
function workoutIdFor(S, p) {
  const base = `wa${createHash('sha1').update(p.clientId).digest('hex').slice(0, 10)}${Math.round(p.start).toString(36)}`;
  let id = base;
  for (let n = 1; (S.workouts || []).some(w => w?.id === id); n++) id = `${base}-${n}`;
  return id;
}

function sessionFrom(S, p) {
  const routine = p.routineId ? (S.routines || []).find(r => r.id === p.routineId) : null;
  const built = routine ? buildCombinedEntries(S, [routine.id]).entries : [];
  const pool = built.map(e => ({ ...e, sets: (e.sets || []).map(x => ({ ...x })) }));
  const entries = p.entries.filter(e => e.sets.length).map(we => {
    const i = pool.findIndex(e => e.id === we.exId);
    const entry = i >= 0 ? pool.splice(i, 1)[0] : { id: we.exId, sets: [], target: null };
    we.sets.forEach((x, k) => { entry.sets[k] = filledRow(entry.sets[k] || {}, x); });
    return entry;
  });
  const bw = lastBW(S);
  return {
    id: workoutIdFor(S, p),
    d: p.date, start: p.start,
    routineIds: routine ? [routine.id] : [],
    name: routine ? (deriveSessionName([routine.name]) || routine.name) : 'Treino livre',
    bw: bw ? bw.w : null, cur: 0,
    entries: [...entries, ...pool],
  };
}

export function applyWatchWorkout(S, p, { now = Date.now() } = {}) {
  const seen = (S.workouts || []).find(w => w?.watch?.clientId === p.clientId);
  if (seen) return { status: 'duplicate', workoutId: seen.id };
  registerCustom(S.customEx);
  const active = sessionFrom(S, p);
  // Uploaded after a later session was logged (the phone stayed home for days): filed into its
  // place in history like the app's "log a past workout", records re-judged around it.
  if ((S.workouts || []).some(w => (w?.start || 0) > p.start)) {
    active.backfill = { durationMin: Math.max(1, Math.round((p.end - p.start) / 60000)) };
  }
  const { w } = finishIntoState(S, active, { now, end: p.end, today: p.date });
  const setSec = {};
  for (const e of p.entries) {
    const secs = e.sets.map(x => (num(x.durSec) ? Math.round(x.durSec) : null));
    if (secs.some(v => v != null)) setSec[e.exId] = secs;
  }
  const stored = S.workouts.find(x => x.id === w.id) || w;
  stored.watch = {
    clientId: p.clientId, device: 'bip6',
    ...(p.hr && typeof p.hr === 'object' ? { hr: p.hr } : {}),
    ...(num(p.kcal) ? { kcal: Math.round(p.kcal) } : {}),
    setSec,
  };
  return { status: 'added', workoutId: stored.id };
}
