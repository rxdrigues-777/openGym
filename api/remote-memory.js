// An in-memory stand-in for the Supabase `files` table (remote-postgrest.js), with the same
// compare-and-set answers. Used by the tests and by STORAGE_DRIVER=memory.
export function createMemoryRemote(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([name, body]) => [name, { body, version: 1 }]));
  const hooks = { beforeWrite: null, failList: false };
  return {
    rows,
    hooks,
    async list() {
      if (hooks.failList) throw new Error('remote unreachable');
      return [...rows].map(([name, r]) => ({ name, version: r.version }));
    },
    async get(names) {
      return names.filter(n => rows.has(n)).map(n => ({ name: n, ...rows.get(n) }));
    },
    async insert(name, body) {
      await hooks.beforeWrite?.(name);
      if (rows.has(name)) return false;
      rows.set(name, { body, version: 1 });
      return true;
    },
    async update(name, body, version) {
      await hooks.beforeWrite?.(name);
      const r = rows.get(name);
      if (!r || r.version !== version) return false;
      rows.set(name, { body, version: version + 1 });
      return true;
    },
    async remove(name, version) {
      await hooks.beforeWrite?.(name);
      const r = rows.get(name);
      if (!r || r.version !== version) return false;
      rows.delete(name);
      return true;
    },
  };
}
