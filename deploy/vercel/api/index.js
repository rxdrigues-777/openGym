// Every /api/* request (vercel.json rewrites them here): the original server.js routes, on the
// Supabase data dir (FORK.md). A catch-all [...path].js only matches one segment outside Next.js.
export { default } from '../../../api/vercel-handler.js';
export const config = { maxDuration: 30 };
