// js/router.js

const routes = [
  { name: 'templates', path: '/', nav: true, load: () => import('./screens/home.js') },
  { name: 'projects', path: '/projects', nav: true, load: () => import('./screens/projects.js') },
  { name: 'profile', path: '/profile', nav: true, load: () => import('./screens/profile.js') },
  { name: 'brand', path: '/brand', nav: false, load: () => import('./screens/brand.js') },
  { name: 'auth', path: '/auth', nav: false, load: () => import('./screens/auth.js') },
  { name: 'slot', path: '/slot/:templateId', nav: false, load: () => import('./screens/slot.js') },
  { name: 'editor', path: '/editor/:projectId', nav: false, load: () => import('./screens/editor.js') },
];

let view = null;
let onRoute = null;
let cleanup = null;
let renderId = 0;

function currentPath() {
  const raw = location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/';
}

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const rParts = route.path.split('/').filter(Boolean);
    if (rParts.length !== parts.length) continue;
    const params = {};
    const ok = rParts.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      return seg === parts[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

function showMessage(text) {
  const p = document.createElement('p');
  p.className = 'text-secondary';
  p.style.padding = 'var(--space-6) var(--page-pad)';
  p.textContent = text;
  view.replaceChildren(p);
}

async function render() {
  const id = ++renderId;
  const found = match(currentPath());
  if (!found) { navigate('/', { replace: true }); return; }
  const { route, params } = found;

  if (cleanup) {
    try { cleanup(); } catch (err) { console.warn('Screen cleanup failed', err); }
    cleanup = null;
  }
  view.replaceChildren();
  if (onRoute) onRoute({ route, params });

  let mod;
  try {
    mod = await route.load();
  } catch (err) {
    if (id !== renderId) return;
    console.warn('Screen failed to load:', route.name, err);
    showMessage('This screen could not be loaded.');
    return;
  }
  if (id !== renderId) return;

  try {
    const result = await mod.default(view, params, { navigate, back });
    if (id !== renderId) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
    view.scrollTop = 0;
  } catch (err) {
    if (id !== renderId) return;
    console.error('Screen error:', route.name, err);
    showMessage('Something went wrong loading this screen.');
  }
}

export function navigate(path, options = {}) {
  if (options.replace) location.replace('#' + path);
  else if (currentPath() === path) render();
  else location.hash = path;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function start(options) {
  view = options.view;
  onRoute = options.onRoute || null;
  window.addEventListener('hashchange', render);
  render();
}
