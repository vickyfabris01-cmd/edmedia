// js/screens/editor.js

import { Button } from '../components/Button.js';
import { IconButton } from '../components/IconButton.js';
import { openActionSheet } from '../components/ActionSheet.js';
import { openNameSheet } from '../components/NameSheet.js';
import { showToast } from '../components/Toast.js';
import { icon } from '../icons.js';
import { createStage } from '../editor/stage.js';
import { openExportSheet } from '../editor/export-sheet.js';
import { CropPanel } from '../editor/panels/crop.js';
import { AdjustPanel } from '../editor/panels/adjust.js';
import { FiltersPanel } from '../editor/panels/filters.js';
import { MaskPanel } from '../editor/panels/mask.js';
import { TextPanel } from '../editor/panels/text.js';
import { WatermarkPanel } from '../editor/panels/watermark.js';
import { ShapesPanel } from '../editor/panels/shapes.js';
import { LayersPanel } from '../editor/panels/layers.js';
import { ResizePanel } from '../editor/panels/resize.js';
import { History } from '../engine/history.js';
import { blankRecipe, cloneRecipe, fitSize, getPhotoLayer, templateRecipeFrom } from '../engine/recipe.js';
import { fixPhotoPosition, layerBounds } from '../engine/render.js';
import { getPreset } from '../engine/filters.js';
import { loadBitmap, sourceSize } from '../engine/canvas.js';
import { makeThumbnailBlob } from '../engine/thumbnail.js';
import { getProject, saveProject } from '../store/projects.js';
import { getPhoto, savePhoto } from '../store/photos.js';
import { getAsset } from '../store/assets.js';
import { listAllTemplates, saveTemplate, ratioGroup } from '../store/templates.js';
import { takePendingPhoto } from '../state.js';
import { newId } from '../utils/ids.js';
import { h, injectStyle } from '../utils/dom.js';

const CSS = `
.editor { display: flex; flex-direction: column; height: 100dvh; background: var(--color-bg); color: var(--color-text); }
.editor__bar { gap: 0; padding-right: var(--space-2); }
.editor__spacer { flex: 1; }
.editor__based { position: absolute; top: var(--space-2); left: var(--space-2); z-index: 3; max-width: 70%; padding: 3px var(--space-3); border-radius: var(--radius-pill);
  background: rgba(0,0,0,0.6); color: #f1f7f3; font-size: var(--text-caption); font-weight: var(--weight-semibold); pointer-events: none; }
.editor__tag { position: absolute; top: var(--space-2); right: var(--space-2); z-index: 3; padding: 3px var(--space-3); border-radius: var(--radius-pill); background: var(--color-accent); color: var(--color-on-accent); font-size: var(--text-caption); font-weight: var(--weight-bold); pointer-events: none; }
.dock { background: var(--color-surface); border-top: 1px solid var(--color-border); padding-bottom: var(--safe-bottom); }
.tools { padding: var(--space-1) var(--space-2); gap: 0; }
.tool { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 68px; min-height: 60px; color: var(--color-text-secondary); font-size: var(--text-tiny); font-weight: var(--weight-semibold); border-radius: var(--radius-md); }
.tool:active { background: var(--color-accent-soft); color: var(--color-accent); }
.pn__head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3) 0; }
.pn__title { flex: 1; font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.pn__body { max-height: 40dvh; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-2) var(--space-4) var(--space-4); }`;

const TOOLS = [
  { id: 'crop', label: 'Crop', icon: 'crop', make: CropPanel },
  { id: 'adjust', label: 'Adjust', icon: 'adjust', make: AdjustPanel },
  { id: 'filters', label: 'Filters', icon: 'filters', make: FiltersPanel },
  { id: 'mask', label: 'Mask', icon: 'mask', make: MaskPanel },
  { id: 'text', label: 'Text', icon: 'text', make: TextPanel },
  { id: 'watermark', label: 'Watermark', icon: 'watermark', make: WatermarkPanel },
  { id: 'shapes', label: 'Shapes', icon: 'shapes', make: ShapesPanel },
  { id: 'layers', label: 'Layers', icon: 'layers', make: LayersPanel },
  { id: 'resize', label: 'Resize', icon: 'resize', make: ResizePanel },
];

const GROUPS = { square: 'Square', portrait: 'Portrait', story: 'Story', wide: 'Wide' };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default async function editor(view, params, ctx) {
  injectStyle('screen-editor', CSS);

  // ---------- Load the project (or start one from a freshly chosen photo) ----------
  let project;
  let bitmap;

  if (params.projectId === 'new') {
    const file = takePendingPhoto();
    if (!file) { ctx.navigate('/', { replace: true }); return; }
    try {
      bitmap = await loadBitmap(file);
    } catch (err) {
      console.error(err);
      showToast('This photo could not be opened.', 'danger');
      ctx.navigate('/', { replace: true });
      return;
    }
    const size = sourceSize(bitmap);
    const dims = fitSize(size.w, size.h, 2048);
    const recipe = blankRecipe(dims.width, dims.height);
    const photoId = await savePhoto(file, size.w, size.h);
    const now = Date.now();
    project = {
      id: newId(), name: 'Untitled edit', templateId: null, templateName: null, recipe, photoId,
      thumbnail: await makeThumbnailBlob(recipe, { photo: bitmap, assets: new Map() }, 240),
      createdAt: now, updatedAt: now, deleted: false,
    };
    await saveProject(project);
    history.replaceState(null, '', '#/editor/' + encodeURIComponent(project.id));
  } else {
    project = await getProject(params.projectId);
    if (!project || project.deleted) {
      showToast('That project could not be found.', 'danger');
      ctx.navigate('/projects', { replace: true });
      return;
    }
    try {
      const rec = await getPhoto(project.photoId);
      bitmap = await loadBitmap(rec.blob);
    } catch (err) {
      console.error(err);
      showToast('The photo for this project is missing on this device.', 'danger');
      ctx.navigate('/projects', { replace: true });
      return;
    }
  }

  // ---------- State ----------
  const sources = { photo: bitmap, assets: new Map() };
  const hist = new History();
  let recipe = cloneRecipe(project.recipe);
  let selectedId = null;
  let panel = null;
  let gestureSnap = null;
  let showOriginal = false;
  let dirty = false;
  let raf = 0;
  let saveTimer = 0;
  let thumbTimer = 0;
  let writing = Promise.resolve();
  const snap = () => JSON.stringify(recipe);
  const photoLayer = () => getPhotoLayer(recipe);
  const selected = () => recipe.layers.find((l) => l.id === selectedId) || null;
  const movable = (l) => l && (l.type === 'text' || l.type === 'shape' || l.type === 'watermark');

  async function ensureAsset(id) {
    if (!id || sources.assets.has(id)) return;
    try {
      const rec = await getAsset(id);
      if (rec) { sources.assets.set(id, await loadBitmap(rec.blob)); requestRender(); }
    } catch (err) { console.warn('Could not load logo', err); }
  }
  recipe.layers.forEach((l) => { if (l.type === 'watermark' && l.mode === 'logo') ensureAsset(l.assetId); });

  // ---------- Saving ----------
  function persist(withThumb) {
    writing = writing.then(async () => {
      try {
        project.recipe = cloneRecipe(recipe);
        project.updatedAt = Date.now();
        if (withThumb) project.thumbnail = await makeThumbnailBlob(recipe, sources, 240);
        await saveProject(project);
      } catch (err) { console.error('Could not save project', err); }
    });
    return writing;
  }
  function markDirty() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { dirty = false; persist(false); }, 700);
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => persist(true), 3000);
  }
  function onHidden() { if (document.visibilityState === 'hidden' && dirty) { dirty = false; persist(false); } }
  document.addEventListener('visibilitychange', onHidden);

  // ---------- Stage ----------
  const stage = createStage();
  function draw() {
    stage.render(recipe, sources, { original: showOriginal });
    refreshOverlay();
  }
  function requestRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  function refreshOverlay() {
    if (showOriginal) { stage.setOverlays([]); return; }
    const W = recipe.canvas.width;
    const H = recipe.canvas.height;
    const items = [];
    const tool = panel && panel.def.id;
    if (tool === 'crop') {
      const s = recipe.slot;
      if (s.w < 0.999 || s.h < 0.999) items.push({ kind: 'slot', x: s.x, y: s.y, w: s.w, h: s.h });
    } else if (tool === 'mask') {
      const m = photoLayer().mask;
      const s = recipe.slot;
      if (m) items.push({ kind: m.shape === 'ellipse' ? 'ellipse' : 'rect', cx: s.x + m.cx * s.w, cy: s.y + m.cy * s.h, w: m.rx * 2 * s.w, h: m.ry * 2 * s.h, rot: 0 });
    } else {
      const sel = selected();
      const b = sel && layerBounds(sel, recipe, sources);
      if (b) items.push({ cx: b.cx / W, cy: b.cy / H, w: b.w / W, h: b.h / H, rot: b.rot });
    }
    stage.setOverlays(items);
  }

  // ---------- Editing helpers (the api that tool panels use) ----------
  function change(fn) {
    if (!panel && gestureSnap === null) gestureSnap = snap();
    fn(recipe);
    markDirty();
    requestRender();
  }
  function commitGesture() {
    if (gestureSnap === null) return;
    if (snap() !== gestureSnap) { hist.push(gestureSnap); updateButtons(); }
    gestureSnap = null;
  }

  const api = {
    get recipe() { return recipe; },
    get sources() { return sources; },
    photoLayer,
    photoSize: () => sourceSize(bitmap),
    selected,
    select(id) { selectedId = id; refreshOverlay(); },
    change,
    addLayer(layer) { change((r) => { r.layers.push(layer); }); selectedId = layer.id; refreshOverlay(); },
    removeLayer(id) { change((r) => { r.layers = r.layers.filter((l) => l.id !== id); }); if (selectedId === id) selectedId = null; refreshOverlay(); },
    moveLayer(id, dir) {
      change((r) => {
        const i = r.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= r.layers.length) return;
        [r.layers[i], r.layers[j]] = [r.layers[j], r.layers[i]];
      });
    },
    duplicateLayer(id) {
      change((r) => {
        const i = r.layers.findIndex((l) => l.id === id);
        if (i < 0) return;
        const copy = structuredClone(r.layers[i]);
        copy.id = newId();
        if (typeof copy.x === 'number') { copy.x = clamp(copy.x + 0.03, 0, 1); copy.y = clamp(copy.y + 0.03, 0, 1); }
        r.layers.splice(i + 1, 0, copy);
        selectedId = copy.id;
      });
      refreshOverlay();
    },
    ensureAsset,
    render: requestRender,
    refresh: refreshOverlay,
    toast: showToast,
  };

  // ---------- Gestures ----------
  stage.handlers = {
    drag(dx, dy) {
      const r = stage.rect();
      const tool = panel && panel.def.id;
      const p = photoLayer();
      if (tool === 'crop') {
        change(() => { p.ox += dx / (r.width * recipe.slot.w); p.oy += dy / (r.height * recipe.slot.h); fixPhotoPosition(recipe, bitmap); });
      } else if (tool === 'mask' && p.mask) {
        change(() => { p.mask.cx = clamp(p.mask.cx + dx / (r.width * recipe.slot.w), 0, 1); p.mask.cy = clamp(p.mask.cy + dy / (r.height * recipe.slot.h), 0, 1); });
      } else if (movable(selected()) && tool !== 'adjust' && tool !== 'filters') {
        const sel = selected();
        if (sel.type === 'watermark') return;
        change(() => { sel.x = clamp(sel.x + dx / r.width, 0, 1); sel.y = clamp(sel.y + dy / r.height, 0, 1); });
      } else {
        stage.panBy(dx, dy);
      }
    },
    pinch(ratio, cx, cy, dx, dy) {
      const tool = panel && panel.def.id;
      const p = photoLayer();
      const sel = selected();
      if (tool === 'crop') {
        change(() => { p.zoom = clamp(p.zoom * ratio, 1, 8); fixPhotoPosition(recipe, bitmap); });
      } else if (tool === 'mask' && p.mask) {
        change(() => { p.mask.rx = clamp(p.mask.rx * ratio, 0.03, 1); p.mask.ry = clamp(p.mask.ry * ratio, 0.03, 1); });
      } else if (movable(sel) && tool !== 'adjust' && tool !== 'filters') {
        change(() => {
          if (sel.type === 'text') sel.size = clamp(sel.size * ratio, 0.01, 0.5);
          else if (sel.type === 'watermark') sel.size = clamp(sel.size * ratio, 0.03, 0.9);
          else if (sel.type === 'shape') { sel.w = clamp(sel.w * ratio, 0.02, 2); if (sel.shape !== 'line' && sel.shape !== 'arrow') sel.h = clamp(sel.h * ratio, 0.02, 2); }
        });
      } else {
        stage.zoomBy(ratio);
        stage.panBy(dx, dy);
      }
    },
    tap(pos) {
      if (panel && (panel.def.id === 'crop' || panel.def.id === 'mask')) return;
      const r = stage.rect();
      const W = recipe.canvas.width;
      const H = recipe.canvas.height;
      const px = ((pos.x - r.left) / r.width) * W;
      const py = ((pos.y - r.top) / r.height) * H;
      let hit = null;
      for (let i = recipe.layers.length - 1; i >= 0 && !hit; i--) {
        const layer = recipe.layers[i];
        if (!layer.visible) continue;
        const b = layerBounds(layer, recipe, sources);
        if (!b) continue;
        const a = (-b.rot * Math.PI) / 180;
        const dx = px - b.cx;
        const dy = py - b.cy;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        const pad = W * 0.015;
        if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad) hit = layer;
      }
      selectedId = hit ? hit.id : null;
      refreshOverlay();
    },
    doubleTap() {
      const tool = panel && panel.def.id;
      if (tool === 'crop') {
        change(() => { const p = photoLayer(); p.zoom = p.zoom > 1.05 ? 1 : 2; fixPhotoPosition(recipe, bitmap); });
      } else {
        stage.resetView();
      }
    },
    end: commitGesture,
  };
  stage.onResize = requestRender;

  // ---------- Top bar ----------
  const undoBtn = IconButton({ icon: 'undo', label: 'Undo', onClick: undo });
  const redoBtn = IconButton({ icon: 'redo', label: 'Redo', onClick: redo });
  const compareBtn = IconButton({ icon: 'compare', label: 'Compare with original (hold)', pressed: false });
  const moreBtn = IconButton({ icon: 'more', label: 'More actions', onClick: openMore });
  const backBtn = IconButton({ icon: 'back', label: 'Back', onClick: leave });
  const exportBtn = Button({ label: 'Export', variant: 'primary', small: true, onClick: doExport });

  function setOriginal(on) {
    showOriginal = on;
    compareBtn.setAttribute('aria-pressed', String(on));
    tagOriginal.hidden = !on;
    draw();
  }
  compareBtn.addEventListener('pointerdown', () => setOriginal(true));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => compareBtn.addEventListener(t, () => { if (showOriginal) setOriginal(false); }));
  compareBtn.addEventListener('click', (e) => { if (e.detail === 0) setOriginal(!showOriginal); }); // keyboard users toggle

  const bar = h('header', { class: 'bar-top editor__bar' }, backBtn, undoBtn, redoBtn, compareBtn, h('span', { class: 'editor__spacer' }), moreBtn, exportBtn);

  function updateButtons() {
    undoBtn.disabled = !hist.canUndo || !!panel;
    redoBtn.disabled = !hist.canRedo || !!panel;
    compareBtn.disabled = !!panel;
  }

  function validSelection() {
    if (selectedId && !recipe.layers.some((l) => l.id === selectedId)) selectedId = null;
  }
  function undo() {
    const prev = hist.undo(snap());
    if (!prev) return;
    recipe = JSON.parse(prev);
    validSelection();
    draw();
    markDirty();
    updateButtons();
  }
  function redo() {
    const next = hist.redo(snap());
    if (!next) return;
    recipe = JSON.parse(next);
    validSelection();
    draw();
    markDirty();
    updateButtons();
  }

  // ---------- Dock: tool row or the open panel ----------
  const dock = h('div', { class: 'dock' });
  const toolRow = h('div', { class: 'scroll-x scroll-x--fade tools' });
  TOOLS.forEach((def) => {
    const btn = h('button', { type: 'button', class: 'tool', 'aria-label': def.label });
    btn.innerHTML = icon(def.icon);
    btn.append(h('span', {}, def.label));
    btn.addEventListener('click', () => openTool(def));
    toolRow.append(btn);
  });
  dock.append(toolRow);

  function openTool(def) {
    if (panel) return;
    const snapshot = snap();
    const selectedBefore = selectedId;
    const built = def.make(api);
    panel = { def, snapshot, selectedBefore, built };
    const head = h('div', { class: 'pn__head' },
      h('h2', { class: 'pn__title' }, built.title),
      Button({ label: 'Cancel', variant: 'secondary', small: true, onClick: () => closePanel(false) }),
      Button({ label: 'Done', variant: 'primary', small: true, onClick: () => closePanel(true) })
    );
    dock.replaceChildren(head, h('div', { class: 'pn__body' }, built.el));
    updateButtons();
    refreshOverlay();
  }

  function closePanel(commit) {
    if (!panel) return;
    const p = panel;
    if (p.built.onClose) p.built.onClose();
    if (commit) {
      if (snap() !== p.snapshot) { hist.push(p.snapshot); markDirty(); }
    } else {
      recipe = JSON.parse(p.snapshot);
      selectedId = p.selectedBefore;
      validSelection();
    }
    panel = null;
    gestureSnap = null;
    dock.replaceChildren(toolRow);
    updateButtons();
    draw();
  }

  // ---------- Overflow actions ----------
  async function autoName() {
    const W = recipe.canvas.width;
    const H = recipe.canvas.height;
    const parts = [GROUPS[ratioGroup(W, H)] + ' ' + W];
    const wm = recipe.layers.find((l) => l.type === 'watermark' && l.visible);
    if (wm) {
      let label = 'Watermark';
      if (wm.mode === 'logo' && wm.assetId) { const a = await getAsset(wm.assetId); label = a ? a.name : 'Logo'; }
      parts.push(label);
    }
    const f = photoLayer().filter;
    if (f && f.preset !== 'original') parts.push(String(f.preset).startsWith('user:') ? 'Custom look' : getPreset(f.preset).label);
    return parts.join(' - ');
  }

  async function saveAsTemplate() {
    try {
      const templateRecipe = templateRecipeFrom(recipe);
      const thumbnail = await makeThumbnailBlob(templateRecipe, sources, 360);
      const url = URL.createObjectURL(thumbnail);
      const preview = h('img', { src: url, alt: 'Template preview', style: 'max-height:22dvh;max-width:100%;object-fit:contain;border-radius:12px;align-self:center;' });
      const name = await openNameSheet({
        title: 'Save as template', initial: await autoName(), confirmLabel: 'Save',
        templates: await listAllTemplates(), preview,
      });
      URL.revokeObjectURL(url);
      if (!name) return;
      await saveTemplate({ name, recipe: templateRecipe, thumbnail });
      showToast('Template saved');
    } catch (err) {
      console.error(err);
      showToast(err && err.message === 'name-taken' ? 'That name is already taken. Try another.' : 'Could not save the template.', 'danger');
    }
  }

  async function renameProject() {
    const name = await openNameSheet({ title: 'Rename project', label: 'Project name', initial: project.name, confirmLabel: 'Rename', templates: [] });
    if (!name) return;
    project.name = name;
    dirty = false;
    await persist(false);
    showToast('Project renamed');
  }

  function openMore() {
    openActionSheet({
      title: project.name,
      actions: [
        { label: 'Save as template', onSelect: saveAsTemplate },
        { label: 'Rename project', onSelect: renameProject },
        { label: 'Reset zoom', onSelect: () => stage.resetView() },
      ],
    });
  }

  async function doExport() {
    clearTimeout(saveTimer);
    await persist(false);
    openExportSheet({ recipe: cloneRecipe(recipe), sources, name: project.name });
  }

  function leave() {
    if (panel) closePanel(true);
    ctx.back('/projects');
  }

  // ---------- Assemble ----------
  const tagOriginal = h('span', { class: 'editor__tag' }, 'ORIGINAL');
  tagOriginal.hidden = true;
  stage.el.append(tagOriginal);
  if (project.templateName) stage.el.append(h('span', { class: 'editor__based' }, 'Based on: ' + project.templateName));

  const root = h('div', { class: 'editor theme-dark' }, bar, stage.el, dock);
  view.append(root);
  updateButtons();
  requestRender();

  return function cleanup() {
    document.removeEventListener('visibilitychange', onHidden);
    clearTimeout(saveTimer);
    clearTimeout(thumbTimer);
    if (raf) cancelAnimationFrame(raf);
    if (panel && panel.built.onClose) panel.built.onClose();
    if (dirty) persist(true);
    stage.destroy();
  };
}
