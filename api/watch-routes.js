// The watch's two routes. The logic lives in watch.js, loaded on first use: it pulls in the
// frontend's helpers, which the api Docker image does not carry (FORK.md), so a self-hosted
// container still boots and only these two routes depend on the rest of the repository.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
let watch = null;
// Both imports reach into frontend/; neither may run when server.js boots (Docker image).
const load = async () => (watch ||= {
  ...(await import('./watch.js')),
  stampChange: (await import('../frontend/src/lib/sync-merge.js')).stampChange,
});

export function watchRoutes({ readSession, readStateStrict, UNREADABLE, storeState, forClient, json, readBody }) {
  return {
    'GET /api/watch/today': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const date = new URL(req.url, 'http://x').searchParams.get('date');
      if (!date || !ISO_DATE.test(date)) return json(res, 400, { error: 'date=YYYY-MM-DD is required (the watch\'s own date)' });
      const cur = readStateStrict(user.id);
      if (cur === UNREADABLE) return json(res, 503, { error: 'state unreadable' });
      const { buildWatchToday, normalizeState } = await load();
      json(res, 200, { ...buildWatchToday(normalizeState(forClient(cur) || {}), date), rev: cur?._rev || 0 });
    },

    'POST /api/watch/workout': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const { validateWatchWorkout, applyWatchWorkout, normalizeState, stampChange } = await load();
      const problem = validateWatchWorkout(body);
      if (problem) return json(res, 400, { error: problem });
      const cur = readStateStrict(user.id);
      if (cur === UNREADABLE) return json(res, 503, { error: 'state unreadable' });
      const base = cur || {};
      const next = normalizeState(structuredClone(forClient(base)));
      const now = Date.now();
      const r = applyWatchWorkout(next, body, { now });
      if (r.status === 'duplicate') return json(res, 200, { ok: true, duplicate: true, workoutId: r.workoutId });
      // Stamped like a phone's own change (lib/sync-merge.js), so devices merge it field by field.
      next._ts = stampChange(base, next, now);
      const stored = storeState(user, { state: next, baseRev: base._rev || 0, baseWid: base._wid, stamped: true }, () => cur);
      if (stored.status !== 200) return json(res, stored.status, stored.payload);
      json(res, 200, { ok: true, workoutId: r.workoutId, rev: stored.payload.rev });
    },
  };
}
