// The name and icons this deployment shows on a phone's home screen. Applied to the built PWA
// rather than to frontend/ so the fork's source stays identical to upstream (FORK.md); the app
// itself still says it is based on openGym.
import fs from 'node:fs';
import path from 'node:path';

export const BRAND = {
  name: 'Cadê o Shape',
  description: 'Treino no relógio, histórico no bolso. Baseado no openGym.',
  icons: ['icon-180.png', 'icon-512.png'],
};

export function applyBrand(outDir) {
  const htmlFile = path.join(outDir, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8');
  if (!html.includes('<title>openGym</title>')) {
    throw new Error('brand: index.html has no <title>openGym</title> to replace — did upstream change it?');
  }
  html = html
    .replace('<title>openGym</title>', `<title>${BRAND.name}</title>`)
    .replace('name="apple-mobile-web-app-title" content="openGym"', `name="apple-mobile-web-app-title" content="${BRAND.name}"`);
  fs.writeFileSync(htmlFile, html);

  const manifestFile = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  Object.assign(manifest, { name: BRAND.name, short_name: BRAND.name, description: BRAND.description });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  for (const icon of BRAND.icons) {
    fs.copyFileSync(new URL(`./brand/${icon}`, import.meta.url), path.join(outDir, icon));
  }
}
