// js/engine/thumbnail.js

import { renderToCanvas } from './render.js';
import { canvasToBlob } from './canvas.js';

export async function makeThumbnailBlob(recipe, sources, maxSide = 360, quality = 0.82) {
  const scale = Math.min(1, maxSide / Math.max(recipe.canvas.width, recipe.canvas.height));
  const canvas = renderToCanvas(recipe, sources, scale);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}
