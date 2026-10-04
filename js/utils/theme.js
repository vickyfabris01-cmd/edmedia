// js/utils/theme.js

const KEY = 'edmedia-theme';
const media = window.matchMedia('(prefers-color-scheme: light)');

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'device';
  } catch { return 'device'; }
}

export function resolveTheme(pref) {
  if (pref === 'device') return media.matches ? 'light' : 'dark';
  return pref;
}

export function applyTheme(pref = getThemePref()) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(pref);
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute('content', bg);
}

export function setThemePref(pref) {
  try {
    if (pref === 'device') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* storage unavailable: the theme still applies for this session */ }
  applyTheme(pref);
}

export function initTheme() {
  applyTheme();
  media.addEventListener('change', () => {
    if (getThemePref() === 'device') applyTheme('device');
  });
}
