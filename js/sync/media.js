// js/sync/media.js

import { createCanvas, canvasToBlob, loadBitmap, sourceSize } from '../engine/canvas.js';
import { MAX_MEDIA_BYTES } from './limits.js';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Returns a copy of the image that is at most maxBytes, or null when it cannot be made small enough.
// Photos become JPEG; logos (keepAlpha) stay PNG so transparency is kept. Small files are returned as they are.
export async function fitUnderLimit(blob, { maxBytes = MAX_MEDIA_BYTES, keepAlpha = false } = {}) {
  if (blob.size <= maxBytes && OK_TYPES.includes(blob.type)) return blob;
  const bitmap = await loadBitmap(blob);
  const { w, h } = sourceSize(bitmap);
  const type = keepAlpha ? 'image/png' : 'image/jpeg';
  let scale = 1;
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const canvas = createCanvas(w * scale, h * scale);
      const ctx = canvas.getContext('2d');
      if (!keepAlpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of keepAlpha ? [undefined] : [0.9, 0.8, 0.7]) {
        const out = await canvasToBlob(canvas, type, quality);
        if (out.size <= maxBytes) return out;
      }
      scale *= 0.8;
    }
  } finally {
    if (bitmap.close) bitmap.close();
  }
  return null;
}

