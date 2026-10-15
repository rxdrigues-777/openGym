// Builds the PWA and stages it, with the exercise media, as this project's static output.
// MEDIA_BASE (optional): serve the media from that URL instead of shipping it (…/still/, …/clip/).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBrand } from './brand.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const out = path.join(here, 'public');
const env = { ...process.env };
if (process.env.MEDIA_BASE) {
  const base = process.env.MEDIA_BASE.replace(/\/+$/, '');
  env.VITE_IMG_BASE = `${base}/still/`;
  env.VITE_GIF_BASE = `${base}/clip/`;
}

execSync('npm run build', { cwd: path.join(repo, 'frontend'), stdio: 'inherit', env });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(repo, 'frontend', 'dist'), out, { recursive: true });
applyBrand(out);
if (!process.env.MEDIA_BASE) {
  for (const kind of ['still', 'clip']) {
    fs.cpSync(path.join(repo, 'catalogue', 'media', kind), path.join(out, 'exercise-media', kind), { recursive: true });
  }
}
console.log('static output ready in', out);
