import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyBrand, BRAND } from './brand.mjs';

function fakeBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-'));
  fs.writeFileSync(path.join(dir, 'index.html'),
    '<title>openGym</title>\n<meta name="apple-mobile-web-app-title" content="openGym">\n<link rel="apple-touch-icon" href="icon-180.png">');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    name: 'openGym', short_name: 'openGym', description: 'Personal gym & body weight tracker',
    icons: [{ src: 'icon-180.png' }, { src: 'icon-512.png' }],
  }));
  fs.writeFileSync(path.join(dir, 'icon-180.png'), 'old');
  fs.writeFileSync(path.join(dir, 'icon-512.png'), 'old');
  return dir;
}

test('the built PWA carries the app name in the title, the home screen name and the manifest', () => {
  const out = fakeBuild();
  applyBrand(out);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /<title>Cadê o Shape<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="Cadê o Shape"/);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert.equal(m.name, 'Cadê o Shape');
  assert.equal(m.short_name, 'Cadê o Shape');
  assert.equal(m.description, BRAND.description);
  assert.deepEqual(m.icons.map(i => i.src), ['icon-180.png', 'icon-512.png']);
});

test('the openGym icons are replaced by the brand ones, byte for byte', () => {
  const out = fakeBuild();
  applyBrand(out);
  for (const f of ['icon-180.png', 'icon-512.png']) {
    assert.deepEqual(fs.readFileSync(path.join(out, f)), fs.readFileSync(new URL(`./brand/${f}`, import.meta.url)));
  }
});

test('a build that no longer has the expected title fails loudly instead of shipping openGym', () => {
  const out = fakeBuild();
  fs.writeFileSync(path.join(out, 'index.html'), '<title>Something else</title>');
  assert.throws(() => applyBrand(out), /title/);
});
