// js/sync/thumbs.js

import { loadBitmap } from '../engine/canvas.js';
import { makeThumbnailBlob } from '../engine/thumbnail.js';
import { samplePhoto } from '../engine/sample.js';
import { getAsset } from '../store/assets.js';

// Thumbnails are not uploaded. After a restore they are drawn again from the recipe.
// photoBlob: the project photo, or null to use the sample landscape (templates).
export async function buildThumbnail(recipe, photoBlob, maxSide) {
  const assets = new Map();
  let photo = null;
  try {
    for (const layer of recipe.layers || []) {
      if (layer.type === 'watermark' && layer.mode === 'logo' && layer.assetId && !assets.has(layer.assetId)) {
        const asset = await getAsset(layer.assetId);
        if (asset && asset.blob) assets.set(layer.assetId, await loadBitmap(asset.blob));
      }
    }
    photo = photoBlob ? await loadBitmap(photoBlob) : samplePhoto();
    return await makeThumbnailBlob(recipe, { photo, assets }, maxSide);
  } catch (err) {
    console.warn('Could not draw a thumbnail', err);
    return undefined;
  } finally {
    if (photoBlob && photo && photo.close) photo.close();
    assets.forEach((b) => { if (b.close) b.close(); });
  }
}

