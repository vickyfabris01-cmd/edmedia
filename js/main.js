// js/main.js

import { initTheme } from './utils/theme.js';
import { start } from './router.js';
import { initBottomNav } from './components/BottomNav.js';
import { consumeAuthRedirect } from './sync/auth.js';
import { initSync } from './sync/sync.js';
import { setPendingAuthMode } from './state.js';

initTheme();

// A sign-in or password-reset link lands here with tokens in the URL hash
const redirectType = consumeAuthRedirect();
if (redirectType === 'recovery') {
  setPendingAuthMode('reset');
  location.replace('#/auth');
}

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const setActiveTab = initBottomNav(nav);

start({
  view,
  onRoute({ route }) {
    nav.hidden = !route.nav;
    if (route.nav) setActiveTab(route.name);
  },
});

initSync();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered', err));
  });
}

// Ask the browser not to evict saved projects and templates under storage pressure
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
