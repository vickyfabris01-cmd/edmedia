// tools/fetch-segmenter.mjs
//
// Downloads the person-detection files used by the "Selective B&W" tool into
// assets/vendor/selfie_segmentation/. Run it once:  node tools/fetch-segmenter.mjs
// Then deploy that folder with the rest of the app. The files are not saved for offline use
// up front; the app keeps them the first time someone uses "Select person".

import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.1675465747';
const URL_TGZ = 'https://registry.npmjs.org/@mediapipe/selfie_segmentation/-/selfie_segmentation-' + VERSION + '.tgz';
const WANTED = [
  'selfie_segmentation.js',
  'selfie_segmentation.binarypb',
  'selfie_segmentation.tflite',
  'selfie_segmentation_solution_simd_wasm_bin.js',
  'selfie_segmentation_solution_simd_wasm_bin.wasm',
  'selfie_segmentation_solution_simd_wasm_bin.data',
  'selfie_segmentation_solution_wasm_bin.js',
  'selfie_segmentation_solution_wasm_bin.wasm',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'vendor', 'selfie_segmentation');

// Minimal tar reader: yields { name, data } for every regular file
function* untar(buf) {
  let pos = 0;
  while (pos + 512 <= buf.length) {
    const header = buf.subarray(pos, pos + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
    const size = parseInt(header.toString('utf8', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    pos += 512;
    if (type === '0' || type === '\0') yield { name: prefix ? prefix + '/' + name : name, data: buf.subarray(pos, pos + size) };
    pos += Math.ceil(size / 512) * 512;
  }
}

if (WANTED.every((f) => existsSync(join(outDir, f)) && (f.endsWith('.data') || statSync(join(outDir, f)).size > 0))) {
  console.log('Already downloaded: ' + outDir);
  process.exit(0);
}

console.log('Downloading ' + URL_TGZ);
const res = await fetch(URL_TGZ);
if (!res.ok) { console.error('Download failed: HTTP ' + res.status); process.exit(1); }
const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
mkdirSync(outDir, { recursive: true });

const found = new Set();
for (const entry of untar(tar)) {
  const base = entry.name.split('/').pop();
  if (!WANTED.includes(base)) continue;
  writeFileSync(join(outDir, base), entry.data);
  found.add(base);
  console.log('  ' + base + '  ' + (entry.data.length / 1024).toFixed(0) + ' KB');
}
const missing = WANTED.filter((f) => !found.has(f));
if (missing.length) { console.error('Missing from the package: ' + missing.join(', ')); process.exit(1); }
console.log('Done. Files are in ' + outDir);