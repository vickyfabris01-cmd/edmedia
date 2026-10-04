// js/screens/slot.js

import { TopBar } from '../components/TopBar.js';
import { Button } from '../components/Button.js';
import { showToast } from '../components/Toast.js';
import { createStage } from '../editor/stage.js';
import { getTemplate } from '../store/templates.js';
import { savePhoto } from '../store/photos.js';
import { saveProject } from '../store/projects.js';
import { takePendingPhoto } from '../state.js';
import { cloneRecipe, getPhotoLayer, templateRecipeFrom } from '../engine/recipe.js';
import { fixPhotoPosition } from '../engine/render.js';
import { loadBitmap, sourceSize } from '../engine/canvas.js';
import { makeThumbnailBlob } from '../engine/thumbnail.js';
import { newId } from '../utils/ids.js';
import { h, injectStyle } from '../utils/dom.js';

const CSS = `
.slot { display: flex; flex-direction: column; height: 100dvh; background: var(--color-bg); color: var(--color-text); }
.slot__hint { padding: var(--space-2) var(--space-4); text-align: center; color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-medium); }
.slot__bar { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); padding: var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom)); background: var(--color-surface); border-top: 1px solid var(--color-border); }
.slot__tag { position: absolute; top: var(--space-2); padding: 2px var(--space-2); border-radius: var(--radius-pill); background: rgba(0,0,0,0.6); color: #f1f7f3; font-size: var(--text-tiny); font-weight: var(--weight-semibold); pointer-events: none; z-index: 3; }
.slot__handle { position: absolute; top: 0; bottom: 0; width: 44px; margin-left: -22px; z-index: 4; touch-action: none; cursor: ew-resize; }
.slot__handle::before { content: ""; position: absolute; top: 0; bottom: 0; left: 21px; width: 2px; background: #fff; box-shadow: 0 0 6px rgba(0,0,0,0.5); }
.slot__knob { position: absolute; top: 50%; left: 22px; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; background: var(--gradient-accent); border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.5); }`;

export default async function slot(view, params, ctx) {
  injectStyle('screen-slot', CSS);

  const template = await getTemplate(params.templateId);
  const file = takePendingPhoto();
  if (!template || !file) {
    if (!template) showToast('That template is no longer available.', 'danger');
    ctx.navigate('/', { replace: true });
    return;
  }

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch (err) {
    console.error(err);
    showToast('This photo could not be opened.', 'danger');
    ctx.navigate('/', { replace: true });
    return;
  }

  const sources = { photo: bitmap, assets: new Map() };
  const recipe = templateRecipeFrom(template.recipe);
  const photo = () => getPhotoLayer(recipe);
  fixPhotoPosition(recipe, bitmap);

  // Logos used by the template's watermark need to be loaded before drawing
  const { getAsset } = await import('../store/assets.js');
  for (const layer of recipe.layers) {
    if (layer.type === 'watermark' && layer.mode === 'logo' && layer.assetId) {
      try {
        const rec = await getAsset(layer.assetId);
        if (rec) sources.assets.set(layer.assetId, await loadBitmap(rec.blob));
      } catch (err) { console.warn('Could not load logo', err); }
    }
  }

  const stage = createStage({ compare: true });
  let split = 50;
  let raf = 0;
  let busy = false;

  const root = h('div', { class: 'slot theme-dark' },
    TopBar({ title: template.name, onBack: () => ctx.back('/') }),
    stage.el,
    h('p', { class: 'slot__hint' }, 'Drag to position  -  Pinch to zoom  -  Double tap to zoom in'),
    h('div', { class: 'slot__bar' },
      Button({ label: 'Reset', variant: 'secondary', onClick() { const p = photo(); p.ox = 0; p.oy = 0; p.zoom = 1; draw(); } }),
      Button({ label: 'Apply', variant: 'primary', onClick: apply })
    )
  );
  const tagL = h('span', { class: 'slot__tag' }, 'Original');
  const tagR = h('span', { class: 'slot__tag' }, 'Edited');
  tagL.style.left = 'var(--space-2)';
  tagR.style.right = 'var(--space-2)';
  const handle = h('div', { class: 'slot__handle', role: 'slider', 'aria-label': 'Compare original and edited', 'aria-valuemin': '0', 'aria-valuemax': '100', tabindex: '0' }, h('span', { class: 'slot__knob' }));
  stage.inner.append(tagL, tagR, handle);
  view.append(root);

  function paintSplit() {
    handle.style.left = split + '%';
    handle.setAttribute('aria-valuenow', String(Math.round(split)));
    if (stage.canvas2) stage.canvas2.style.clipPath = 'inset(0 ' + (100 - split) + '% 0 0)';
  }

  function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      stage.render(recipe, sources);
      stage.renderOriginal(recipe, sources);
      paintSplit();
    });
  }

  // Compare handle
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = stage.rect();
      split = Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100));
      paintSplit();
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    move(e);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { split = Math.max(0, split - 5); paintSplit(); }
    if (e.key === 'ArrowRight') { split = Math.min(100, split + 5); paintSplit(); }
  });

  // Photo gestures
  stage.handlers = {
    ignore: (e) => handle.contains(e.target),
    drag(dx, dy) {
      const r = stage.rect();
      const p = photo();
      p.ox += dx / (r.width * recipe.slot.w);
      p.oy += dy / (r.height * recipe.slot.h);
      fixPhotoPosition(recipe, bitmap);
      draw();
    },
    pinch(ratio) {
      const p = photo();
      p.zoom = Math.min(8, Math.max(1, p.zoom * ratio));
      fixPhotoPosition(recipe, bitmap);
      draw();
    },
    doubleTap() {
      const p = photo();
      p.zoom = p.zoom > 1.05 ? 1 : 2;
      fixPhotoPosition(recipe, bitmap);
      draw();
    },
  };
  stage.onResize = draw;
  draw();

  async function apply() {
    if (busy) return;
    busy = true;
    try {
      const size = sourceSize(bitmap);
      const photoId = await savePhoto(file, size.w, size.h);
      const now = Date.now();
      const project = {
        id: newId(), name: template.name, templateId: template.id, templateName: template.name,
        recipe: cloneRecipe(recipe), photoId, thumbnail: await makeThumbnailBlob(recipe, sources, 240),
        createdAt: now, updatedAt: now, deleted: false,
      };
      await saveProject(project);
      ctx.navigate('/editor/' + encodeURIComponent(project.id), { replace: true });
    } catch (err) {
      console.error(err);
      showToast('Could not start this project.', 'danger');
      busy = false;
    }
  }

  return function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    stage.destroy();
  };
}
