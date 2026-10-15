// Where server.js keeps DATA_DIR: on the disk (default, exactly as upstream), or in a remote
// table (STORAGE_DRIVER=supabase on Vercel; =memory in tests). Imported in place of node:fs.
import realFs from 'node:fs';
import { atomicWrite as diskAtomicWrite } from './durable.js';
import { createVfs } from './vfs.js';
import { createPostgrestRemote } from './remote-postgrest.js';
import { createMemoryRemote } from './remote-memory.js';

const DRIVER = String(process.env.STORAGE_DRIVER || 'fs').toLowerCase();
const DATA = process.env.DATA_DIR || '/data';

function remoteFor(driver) {
  if (driver === 'supabase') {
    return createPostgrestRemote({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
  }
  if (driver === 'memory') return createMemoryRemote();
  if (driver !== 'fs') throw new Error(`STORAGE_DRIVER must be fs, supabase or memory, not "${driver}"`);
  return null;
}

export const remoteStore = remoteFor(DRIVER);
export const vfs = remoteStore ? createVfs({ dataDir: DATA, remote: remoteStore, env: process.env }) : null;
export const atomicWrite = vfs ? vfs.atomicWrite : diskAtomicWrite;
export default vfs ? vfs.fs : realFs;
