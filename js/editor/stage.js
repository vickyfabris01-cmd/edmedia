// js/editor/stage.js

import { renderRecipe } from '../engine/render.js';
import { attachGestures } from '../engine/gesture.js';
import { injectStyle, h } from '../utils/dom.js';

const CSS = `
.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; touch-action: none; background: var(--color-canvas, #050806); }
.stage__inner { position: absolute; transform-origin: 50% 50%; box-shadow: 0 6px 30px rgba(0,0,0,0.5); }
.stage__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.stage__overlay { position: absolute; inset: 0; pointer-events: none; }
.stage__box { position: absolute; border: 2px dashed #4ade80; box-sizing: border-box; transform: translate(-50%, -50%); }
.stage__box--round { border-radius: 50%; }
.stage__box--slot { border-style: solid; border-color: rgba(255,255,255,0.7); transform: none; }
.stage__corner { position: absolute; width: 10px; height: 10px; background: #4ade80; border-radius: 50%; }`;

// The editing surface: a canvas that fits the screen, with pinch zoom, pan, and selection boxes.
export function createStage({ compare = false } = {}) {
  injectStyle('stage', CSS);
  const canvas = h('canvas', { class: 'stage__canvas' });
  const canvas2 = compare ? h('canvas', { class: 'stage__canvas' }) : null;
  const overlay = h('div', { class: 'stage__overlay' });
  const inner = h('div', { class: 'stage__inner' }, canvas, canvas2, overlay);
  const el = h('div', { class: 'stage' }, inner);

  let W = 1;
  let H = 1;
  const view = { z: 1, tx: 0, ty: 0 };
  let handlers = {};
  let onResize = null;

  function applyView() {
    inner.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.z + ')';
  }

  function layout() {
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return null;
    const pad = 16;
    const s = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H);
    const dw = Math.max(1, W * s);
    const dh = Math.max(1, H * s);
    inner.style.width = dw + 'px';
    inner.style.height = dh + 'px';
    inner.style.left = (cw - dw) / 2 + 'px';
    inner.style.top = (ch - dh) / 2 + 'px';
    applyView();
    return { dw, dh };
  }

  function backingScale(dw) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longest = Math.max(W, H);
    return Math.max(0.05, Math.min(1, 1500 / longest, (dw * dpr) / W));
  }

  const detach = attachGestures(el, {
    onDrag: (dx, dy, e) => handlers.drag && handlers.drag(dx, dy, e),
    onPinch: (ratio, cx, cy, dx, dy) => handlers.pinch && handlers.pinch(ratio, cx, cy, dx, dy),
    onTap: (pos) => handlers.tap && handlers.tap(pos),
    onDoubleTap: (pos) => handlers.doubleTap && handlers.doubleTap(pos),
    onEnd: () => handlers.end && handlers.end(),
    filter: (e) => !(handlers.ignore && handlers.ignore(e)),
  });

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { layout(); if (onResize) onResize(); }) : null;
  if (ro) ro.observe(el);

  return {
    el, canvas, canvas2, inner, overlay, view,
    set handlers(value) { handlers = value || {}; },
    set onResize(fn) { onResize = fn; },
    setSize(w, hh) { W = w; H = hh; return layout(); },
    // Draws the recipe at a size that suits the screen.
    render(recipe, sources, opts = {}) {
      const size = this.setSize(recipe.canvas.width, recipe.canvas.height) || { dw: 300 };
      renderRecipe(canvas, recipe, sources, { scale: backingScale(size.dw), original: !!opts.original });
    },
    renderOriginal(recipe, sources) {
      if (!canvas2) return;
      const size = this.setSize(recipe.canvas.width, recipe.canvas.height) || { dw: 300 };
      renderRecipe(canvas2, recipe, sources, { scale: backingScale(size.dw), original: true });
    },
    rect() { return inner.getBoundingClientRect(); },
    panBy(dx, dy) {
      if (view.z <= 1.001) return;
      view.tx += dx;
      view.ty += dy;
      applyView();
    },
    zoomBy(ratio) {
      view.z = Math.min(8, Math.max(1, view.z * ratio));
      if (view.z <= 1.001) { view.z = 1; view.tx = 0; view.ty = 0; }
      applyView();
    },
    resetView() { view.z = 1; view.tx = 0; view.ty = 0; applyView(); },
    // items: [{ cx, cy, w, h, rot, kind }] as fractions of the canvas (rot in degrees)
    setOverlays(items) {
      overlay.replaceChildren();
      (items || []).forEach((it) => {
        const box = h('div', { class: 'stage__box' + (it.kind === 'ellipse' ? ' stage__box--round' : '') + (it.kind === 'slot' ? ' stage__box--slot' : '') });
        if (it.kind === 'slot') {
          box.style.left = it.x * 100 + '%';
          box.style.top = it.y * 100 + '%';
          box.style.width = it.w * 100 + '%';
          box.style.height = it.h * 100 + '%';
        } else {
          box.style.left = it.cx * 100 + '%';
          box.style.top = it.cy * 100 + '%';
          box.style.width = Math.max(it.w, 0.01) * 100 + '%';
          box.style.height = Math.max(it.h, 0.01) * 100 + '%';
          box.style.transform = 'translate(-50%, -50%) rotate(' + (it.rot || 0) + 'deg)';
          if (it.kind !== 'ellipse') {
            ['0 0', '100% 0', '0 100%', '100% 100%'].forEach((pos) => {
              const [l, t] = pos.split(' ');
              const c = h('span', { class: 'stage__corner' });
              c.style.left = l === '0' ? '-6px' : 'calc(100% - 4px)';
              c.style.top = t === '0' ? '-6px' : 'calc(100% - 4px)';
              box.append(c);
            });
          }
        }
        overlay.append(box);
      });
    },
    destroy() {
      detach();
      if (ro) ro.disconnect();
    },
  };
}