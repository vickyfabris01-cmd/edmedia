// js/engine/gesture.js

// One-finger drag, two-finger pinch, tap, double tap, and mouse wheel on an element.
// The element needs touch-action: none in CSS.
export function attachGestures(el, handlers) {
  const pts = new Map();
  let last = null;
  let moved = false;
  let start = null;
  let lastTap = 0;
  let lastTapPos = null;

  function pair() {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (handlers.filter && !handlers.filter(e)) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { moved = false; start = { x: e.clientX, y: e.clientY }; }
    if (pts.size === 2) { last = pair(); moved = true; }
  }

  function move(e) {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) > 6) moved = true;
      if (moved && handlers.onDrag) handlers.onDrag(cur.x - prev.x, cur.y - prev.y, e);
      pts.set(e.pointerId, cur);
    } else if (pts.size === 2) {
      pts.set(e.pointerId, cur);
      const c = pair();
      if (last && last.d > 0 && handlers.onPinch) handlers.onPinch(c.d / last.d, c.x, c.y, c.x - last.x, c.y - last.y);
      last = c;
    }
  }

  function up(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) last = null;
    if (pts.size === 1) moved = true;
    if (pts.size === 0) {
      if (!moved && e.type === 'pointerup') {
        const pos = { x: e.clientX, y: e.clientY };
        const now = Date.now();
        if (lastTap && now - lastTap < 320 && lastTapPos && Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y) < 28) {
          lastTap = 0;
          if (handlers.onDoubleTap) handlers.onDoubleTap(pos);
        } else {
          lastTap = now;
          lastTapPos = pos;
          if (handlers.onTap) handlers.onTap(pos);
        }
      }
      if (handlers.onEnd) handlers.onEnd();
    }
  }

  function wheel(e) {
    if (!handlers.onPinch) return;
    e.preventDefault();
    handlers.onPinch(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, 0, 0);
    if (handlers.onEnd) handlers.onEnd();
  }

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });

  return function detach() {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}
