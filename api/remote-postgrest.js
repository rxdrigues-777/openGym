// The `files` table of a Supabase project, through its PostgREST endpoint, as the remote vfs.js
// stores DATA_DIR in. Plain fetch: api/ keeps its dependency count. Every write is conditional on
// the version the caller last saw, so two instances can never silently overwrite each other.
export function createPostgrestRemote({ url, key, fetchImpl = globalThis.fetch, table = 'files' }) {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase');
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1/${table}`;
  const q = v => encodeURIComponent(v);

  async function call(method, query, { body, prefer } = {}) {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetchImpl(query ? `${base}?${query}` : base, {
      method, headers, body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  }
  const fail = (op, r) => {
    throw new Error(`supabase ${op} failed: HTTP ${r.status} ${JSON.stringify(r.data ?? '').slice(0, 200)}`);
  };

  return {
    async list() {
      const r = await call('GET', 'select=name,version');
      if (r.status !== 200) fail('list', r);
      return r.data;
    },
    async get(names) {
      if (!names.length) return [];
      const list = `(${names.map(n => `"${String(n).replace(/"/g, '')}"`).join(',')})`;
      const r = await call('GET', `select=name,body,version&name=in.${q(list)}`);
      if (r.status !== 200) fail('get', r);
      return r.data;
    },
    async insert(name, body) {
      const r = await call('POST', '', { body: { name, body, version: 1 }, prefer: 'return=minimal' });
      if (r.status === 201) return true;
      if (r.status === 409) return false;
      fail('insert', r);
    },
    async update(name, body, version) {
      const r = await call('PATCH', `name=eq.${q(name)}&version=eq.${version}`, {
        body: { body, version: version + 1, updated_at: new Date().toISOString() },
        prefer: 'return=representation',
      });
      if (r.status !== 200) fail('update', r);
      return r.data.length === 1;
    },
    async remove(name, version) {
      const r = await call('DELETE', `name=eq.${q(name)}&version=eq.${version}`, { prefer: 'return=representation' });
      if (r.status !== 200) fail('remove', r);
      return r.data.length === 1;
    },
  };
}
