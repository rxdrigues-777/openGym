// What the watch needs from a profile, and what it sends back, in openGym's own terms. Built on
// the frontend's pure helpers (frontend/src/lib) so the prescription the wrist shows and the
// records its workouts set are the app's, not a second implementation. Loaded on demand by
// watch-routes.js: the api Docker image does not ship frontend/, and only these routes need it.
import { effectiveRoutineIds, lastEntryFor, bestWeightFor } from '../frontend/src/lib/history.js';
import { buildSessionEntries } from '../frontend/src/lib/session-start.js';
import { weightIncrement } from '../frontend/src/lib/progression.js';
import { registerCustom, EXIDX } from '../frontend/src/lib/exercises.js';
import { isWarmupRow } from '../frontend/src/lib/workout-model.js';
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
          sets: (e.sets || []).map(row => ({ w: Number(row.w) || 0, r: Number(row.r) || 0, warmup: isWarmupRow(row) })),
          last: lastTop(S, e.id, r.id),
          best: bestWeightFor(S, e.id) || 0,
        };
      }),
    };
  });
  const planned = routines.length ? effectiveRoutineIds(S, iso, iso) : [];
  return { date: iso, suggestedRoutineId: planned[0] ?? null, unit: S.unit || 'kg', routines };
}
