// js/engine/recipe.js

import { newId } from '../utils/ids.js';

export const RECIPE_VERSION = 1;
export const MAX_SIDE = 4096;
export const MIN_SIDE = 64;
export const PHOTO_ID = 'photo';

// Everything is stored as fractions of the canvas so a recipe works at any size.
export function defaultPhotoLayer() {
  return {
    id: PHOTO_ID, type: 'photo', name: 'Photo', visible: true, opacity: 1,
    zoom: 1, ox: 0, oy: 0, rot: 0, flipH: false, flipV: false, straighten: 0,
    adjust: {}, filter: { preset: 'original', intensity: 1 }, mask: null,
  };
}

export function blankRecipe(width, height, background = '#000000') {
  return {
    version: RECIPE_VERSION,
    canvas: { width, height, background },
    slot: { x: 0, y: 0, w: 1, h: 1 },
    layers: [defaultPhotoLayer()],
  };
}

export function cloneRecipe(recipe) {
  return structuredClone(recipe);
}

export function getPhotoLayer(recipe) {
  return recipe.layers.find((l) => l.type === 'photo');
}

// A template keeps the look but not where one particular photo was placed.
export function templateRecipeFrom(recipe) {
  const copy = cloneRecipe(recipe);
  const photo = getPhotoLayer(copy);
  if (photo) { photo.zoom = 1; photo.ox = 0; photo.oy = 0; photo.rot = 0; photo.flipH = false; photo.flipV = false; photo.straighten = 0; }
  return copy;
}

export function fitSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function newTextLayer(partial = {}) {
  return {
    id: newId(), type: 'text', name: 'Text', visible: true, opacity: 1,
    content: 'Your text', font: 'sans', size: 0.07, bold: true, italic: false, color: '#ffffff',
    align: 'center', bg: '', bgOpacity: 0.7, outline: { color: '#000000', width: 0 }, shadow: 0.4,
    rotation: 0, x: 0.5, y: 0.5, w: 0.8, ...partial,
  };
}

export const SHAPE_LABELS = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', frame: 'Frame' };

export function newShapeLayer(shape = 'rect', partial = {}) {
  const base = {
    id: newId(), type: 'shape', shape, name: SHAPE_LABELS[shape] || 'Shape', visible: true, opacity: 1,
    x: 0.5, y: 0.5, w: 0.4, h: 0.25, rotation: 0, color: '#ffffff', thickness: 0.008, fill: false,
  };
  if (shape === 'line' || shape === 'arrow') { base.w = 0.4; base.h = 0.02; }
  if (shape === 'frame') { base.thickness = 0.03; base.x = 0.5; base.y = 0.5; base.w = 1; base.h = 1; }
  return { ...base, ...partial };
}

export function newWatermarkLayer(partial = {}) {
  return {
    id: newId(), type: 'watermark', name: 'Watermark', visible: true, opacity: 0.8,
    mode: 'text', text: 'EdMedia', assetId: null, color: '#ffffff', position: 'br',
    size: 0.2, rotation: 0, tiled: false, ...partial,
  };
}

// One blurred area. shape: 'brush' (strokes, points as fractions of the canvas), 'rect' or 'ellipse' (cx, cy, w, h as fractions of the canvas).
export function newBlurLayer(partial = {}) {
  return {
    id: newId(), type: 'blur', name: 'Blur', visible: true, opacity: 1,
    shape: 'brush', strength: 60, feather: 20, lock: false,
    cx: 0.5, cy: 0.5, w: 0.4, h: 0.3, strokes: [], ...partial,
  };
}

export function layerLabel(layer) {
  if (layer.type === 'photo') return 'Photo';
  if (layer.type === 'text') return (layer.content || 'Text').split('\n')[0].slice(0, 24) || 'Text';
  if (layer.type === 'shape') return SHAPE_LABELS[layer.shape] || 'Shape';
  if (layer.type === 'watermark') return layer.mode === 'logo' ? 'Logo watermark' : 'Watermark';
  if (layer.type === 'blur') return layer.shape === 'rect' ? 'Blur (rectangle)' : layer.shape === 'ellipse' ? 'Blur (ellipse)' : 'Blur (brush)';
  return 'Layer';
}