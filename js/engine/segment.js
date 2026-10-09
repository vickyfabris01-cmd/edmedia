// js/engine/segment.js

// Finds people in a picture (MediaPipe selfie segmentation, runs on the phone, no upload).
// The files live in assets/vendor/selfie_segmentation/ (get them with: node tools/fetch-segmenter.mjs).
// They are saved for offline use the first time they are fetched. If the folder is missing,
// the files are loaded from the internet instead.

const LOCAL = new URL('../../assets/vendor/selfie_segmentation/', import.meta.url).href;
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/';

let segmenter = null; // Promise of { seg, base }
let pending = null; // { resolve, reject } of the picture being processed

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { el.remove(); reject(new Error('Could not load ' + url)); };
    document.head.append(el);
  });
}

async function create() {
  let base = LOCAL;
  if (!window.SelfieSegmentation) {
    try { await loadScript(LOCAL + 'selfie_segmentation.js'); }
    catch {
      base = CDN;
      try { await loadScript(CDN + 'selfie_segmentation.js'); }
      catch { throw new Error('The person detector could not be loaded. Check your connection and try again.'); }
    }
  }
  const seg = new window.SelfieSegmentation({ locateFile: (file) => base + file });
  seg.setOptions({ modelSelection: 0, selfieMode: false });
  seg.onResults((results) => {
    const p = pending;
    pending = null;
    if (p) p.resolve(results);
  });
  try { await seg.initialize(); }
  catch { throw new Error('The person detector could not start on this device.'); }
  return { seg };
}

// canvas: the picture to look at. Returns { w, h, alpha } where alpha holds 0-255 per cell
// (how sure the detector is that a person is there), the same size as the canvas.
export async function segmentPerson(canvas) {
  if (!segmenter) segmenter = create().catch((err) => { segmenter = null; throw err; });
  const { seg } = await segmenter;
  const results = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending = null; reject(new Error('The person detector took too long. Try again.')); }, 60000);
    pending = { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject };
    seg.send({ image: canvas }).catch((err) => { clearTimeout(timer); pending = null; reject(err); });
  });
  const mask = results.segmentationMask;
  const w = mask.width;
  const h = mask.height;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3]; // the result is stored in the alpha channel
  return { w, h, alpha };
}

// Frees the detector's memory. It starts again the next time it is needed.
export function closeSegmenter() {
  const s = segmenter;
  segmenter = null;
  pending = null;
  if (s) s.then(({ seg }) => { try { seg.close(); } catch { /* already closed */ } }).catch(() => {});
}