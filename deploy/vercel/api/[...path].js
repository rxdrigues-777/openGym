// Every /api/* request: the original server.js routes, on the Supabase data dir (FORK.md).
export { default } from '../../../api/vercel-handler.js';
export const config = { maxDuration: 30 };
