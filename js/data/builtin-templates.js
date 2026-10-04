// js/data/builtin-templates.js

import { blankRecipe, getPhotoLayer, newShapeLayer, newTextLayer, newWatermarkLayer } from '../engine/recipe.js';

function make(id, name, width, height, build) {
  const recipe = blankRecipe(width, height, '#000000');
  build(recipe, getPhotoLayer(recipe));
  return { id, name, width, height, recipe, builtin: true, createdAt: 0, updatedAt: 0, deleted: false };
}

export const BUILTIN_TEMPLATES = [
  make('builtin-square-frame', 'Square - Clean Frame', 1080, 1080, (r) => {
    r.layers.push(newShapeLayer('frame', { color: '#ffffff', thickness: 0.03, name: 'Frame' }));
  }),
  make('builtin-portrait-mark', 'Portrait 4:5 - Watermark', 1080, 1350, (r) => {
    r.layers.push(newWatermarkLayer({ text: 'YOUR BRAND', position: 'br', size: 0.22, opacity: 0.85 }));
  }),
  make('builtin-story-caption', 'Story - Caption Bar', 1080, 1920, (r) => {
    r.layers.push(
      newShapeLayer('rect', { x: 0.5, y: 0.9, w: 1, h: 0.2, fill: true, thickness: 0, color: '#000000', opacity: 0.55, name: 'Bar' }),
      newTextLayer({ content: 'YOUR CAPTION', x: 0.5, y: 0.9, size: 0.07, name: 'Caption' })
    );
  }),
  make('builtin-youtube-title', 'YouTube Thumbnail', 1280, 720, (r, p) => {
    p.filter = { preset: 'vivid', intensity: 1 };
    p.adjust = { vignette: 30 };
    r.layers.push(
      newTextLayer({ content: 'BIG TITLE', font: 'display', x: 0.3, y: 0.78, size: 0.11, w: 0.55, outline: { color: '#000000', width: 0.12 }, color: '#fde047', name: 'Title' })
    );
  }),
  make('builtin-match-day', 'Match Day', 1080, 1350, (r, p) => {
    p.adjust = { contrast: 10, vignette: 20 };
    r.layers.push(
      newShapeLayer('rect', { x: 0.5, y: 0.06, w: 1, h: 0.12, fill: true, thickness: 0, color: '#14532d', opacity: 0.92, name: 'Banner' }),
      newTextLayer({ content: 'MATCH DAY', font: 'display', x: 0.5, y: 0.06, size: 0.075, name: 'Title' }),
      newShapeLayer('rect', { x: 0.5, y: 0.94, w: 1, h: 0.12, fill: true, thickness: 0, color: '#052e16', opacity: 0.92, name: 'Strip' }),
      newTextLayer({ content: 'HOME vs AWAY', x: 0.5, y: 0.94, size: 0.05, name: 'Fixture' })
    );
  }),
  make('builtin-polaroid', 'Polaroid', 1080, 1350, (r) => {
    r.canvas.background = '#f8f8f2';
    r.slot = { x: 0.0556, y: 0.0444, w: 0.8889, h: 0.7111 };
    r.layers.push(
      newTextLayer({ content: 'Caption', font: 'script', x: 0.5, y: 0.87, size: 0.07, color: '#333333', bold: false, shadow: 0, name: 'Caption' })
    );
  }),
  make('builtin-vintage', 'Vintage Warm', 1080, 1080, (r, p) => {
    p.filter = { preset: 'vintage', intensity: 1 };
    r.layers.push(newShapeLayer('frame', { color: '#f4ecd8', thickness: 0.035, name: 'Frame' }));
  }),
  make('builtin-bw-drama', 'Black and White Drama', 1080, 1350, (r, p) => {
    p.filter = { preset: 'bw', intensity: 1 };
    p.adjust = { contrast: 25, vignette: 40, clarity: 20 };
  }),
];

export function isBuiltinId(id) {
  return typeof id === 'string' && id.startsWith('builtin-');
}
