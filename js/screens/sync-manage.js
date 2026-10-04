// js/screens/sync-manage.js

import { TopBar } from '../components/TopBar.js';
import { Button } from '../components/Button.js';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { EmptyState } from '../components/EmptyState.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { showToast } from '../components/Toast.js';
import { isConfigured, getSession, onAuthChange } from '../sync/auth.js';
import { getQuota, refreshQuota, listSyncItems, syncItem, unsyncItem, onSyncState, syncNow } from '../sync/sync.js';
import { AUTO_DELETE_AT, MAX_MEDIA_BYTES, EXPIRE_DAYS } from '../sync/limits.js';
import { formatBytes, formatRelative } from '../utils/format.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.sm-usage { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.sm-usage__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.sm-usage__big { font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.sm-usage__left { color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-medium); }
.sm-bar { position: relative; height: 10px; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-surface-3); }
.sm-bar__fill { height: 100%; border-radius: var(--radius-pill); background: var(--color-accent); transition: width var(--transition-fast); }
.sm-bar__fill--warn { background: var(--color-warning); }
.sm-bar__fill--full { background: var(--color-danger); }
.sm-rules { display: flex; flex-direction: column; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--text-caption); }
.sm-rules p { margin: 0; }
.sm-list { display: flex; flex-direction: column; gap: var(--space-2); }
.sm-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.sm-row__thumb { flex: none; width: 52px; height: 52px; overflow: hidden; border-radius: var(--radius-md); background: var(--color-surface-3); }
.sm-row__thumb img { width: 100%; height: 100%; object-fit: cover; }
.sm-row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sm-row__name { font-weight: var(--weight-semibold); }
.sm-row__line { color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-medium); }
.sm-row__line--ok { color: var(--color-success); }
.sm-row__line--off { color: var(--color-warning); }`;

const REASONS = {
  manual: 'Not synced: removed from the cloud by you',
  quota: 'Not synced: the cloud space was full',
  expired: 'Not synced: not edited for ' + Math.round(EXPIRE_DAYS / 30) + ' months',
  size: 'Not synced: the picture is over ' + formatBytes(MAX_MEDIA_BYTES),
};

export default async function syncManage(view, params, ctx) {
  injectStyle('screen-sync-manage', CSS);
  const unsubscribers = [];
  const urls = [];

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({ title: 'Cloud sync', onBack: () => ctx.back('/profile') }));
  const body = document.createElement('div');
  body.className = 'screen__body stack stack--loose';
  root.append(body);
  view.append(root);

  if (!isConfigured() || !getSession()) {
    body.append(EmptyState({
      title: 'Sign in to use cloud sync',
      text: 'Your projects and templates are backed up to your account, so you can use them on another device.',
      action: Button({ label: 'Sign in', variant: 'primary', onClick: () => ctx.navigate('/auth') }),
    }));
    return;
  }

  // ---------- Space used ----------
  const usage = document.createElement('section');
  usage.className = 'sm-usage';
  const top = document.createElement('div');
  top.className = 'sm-usage__top';
  const big = document.createElement('div');
  big.className = 'sm-usage__big';
  const left = document.createElement('div');
  left.className = 'sm-usage__left';
  top.append(big, left);
  const bar = document.createElement('div');
  bar.className = 'sm-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Cloud space used');
  const fill = document.createElement('div');
  fill.className = 'sm-bar__fill';
  bar.append(fill);
  const rules = document.createElement('div');
  rules.className = 'sm-rules';
  [
    'Only a smaller copy of each photo is stored (' + formatBytes(MAX_MEDIA_BYTES) + ' at most). Your original stays on this device.',
    'When the space is ' + Math.round(AUTO_DELETE_AT * 100) + '% full, the oldest synced projects are removed from the cloud to make room for new ones.',
    'Projects not edited for ' + Math.round(EXPIRE_DAYS / 30) + ' months are removed from the cloud. Everything stays on this device.',
  ].forEach((t) => { const p = document.createElement('p'); p.textContent = t; rules.append(p); });
  usage.append(top, bar, rules);

  function paintUsage() {
    const q = getQuota();
    const share = q.limit ? Math.min(1, q.used / q.limit) : 0;
    big.textContent = formatBytes(q.used) + ' of ' + formatBytes(q.limit);
    left.textContent = formatBytes(Math.max(0, q.limit - q.used)) + ' left';
    fill.style.width = Math.max(share > 0 ? 2 : 0, Math.round(share * 100)) + '%';
    fill.className = 'sm-bar__fill' + (share >= AUTO_DELETE_AT ? ' sm-bar__fill--full' : share >= 0.8 ? ' sm-bar__fill--warn' : '');
    bar.setAttribute('aria-valuenow', String(Math.round(share * 100)));
  }

  // ---------- Projects / Templates ----------
  let kind = 'projects';
  const tabs = SegmentedControl({
    ariaLabel: 'Show projects or templates', value: kind,
    options: [{ value: 'projects', label: 'Projects' }, { value: 'templates', label: 'Templates' }],
    onChange(v) { kind = v; renderList(); },
  });
  const hint = document.createElement('p');
  hint.className = 'text-caption text-secondary';
  const list = document.createElement('div');
  list.className = 'sm-list';
  body.append(usage, tabs.el, hint, list);

  function statusLine(item) {
    if (item.status === 'synced') return ['Synced' + (item.size ? ' - ' + formatBytes(item.size) : ''), 'ok'];
    if (item.status === 'off') return [REASONS[item.reason] || REASONS.manual, 'off'];
    return ['Waiting to sync', ''];
  }

  function row(item) {
    const el = document.createElement('article');
    el.className = 'sm-row';
    const thumb = document.createElement('div');
    thumb.className = 'sm-row__thumb';
    if (item.thumbnail instanceof Blob) {
      const url = URL.createObjectURL(item.thumbnail);
      urls.push(url);
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      thumb.append(img);
    }
    const text = document.createElement('div');
    text.className = 'sm-row__text';
    const name = document.createElement('div');
    name.className = 'sm-row__name truncate';
    name.textContent = item.name;
    const [lineText, lineKind] = statusLine(item);
    const line = document.createElement('div');
    line.className = 'sm-row__line' + (lineKind ? ' sm-row__line--' + lineKind : '');
    line.textContent = lineText;
    const edited = document.createElement('div');
    edited.className = 'sm-row__line';
    edited.textContent = 'Edited ' + formatRelative(item.updatedAt);
    text.append(name, line, edited);

    const off = item.status === 'off';
    const button = Button({
      label: off ? 'Sync' : 'Unsync', variant: off ? 'primary' : 'secondary', small: true,
      async onClick() {
        button.disabled = true;
        try {
          if (off) {
            await syncItem(kind, item.id);
            showToast('Synced');
          } else {
            const ok = await confirmDialog({
              title: 'Remove from the cloud?',
              text: '"' + item.name + '" stays on this device but is no longer backed up. It will not sync again until you tap Sync.',
              confirmLabel: 'Unsync',
            });
            if (!ok) { button.disabled = false; return; }
            await unsyncItem(kind, item.id);
            showToast('Removed from the cloud');
          }
        } catch (err) {
          showToast(err.message || 'Something went wrong.', 'danger');
        }
        await refreshQuota();
        paintUsage();
        renderList();
      },
    });
    el.append(thumb, text, button);
    return el;
  }

  let renderToken = 0;
  async function renderList() {
    const token = ++renderToken;
    hint.textContent = kind === 'templates' ? 'Only a template\'s settings are synced, never pictures. Logos it uses sync with your brand library.' : '';
    hint.hidden = kind !== 'templates';
    let items = [];
    try { items = await listSyncItems(kind); } catch (err) { console.error(err); }
    if (token !== renderToken) return;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    list.replaceChildren();
    if (!items.length) {
      list.append(EmptyState({ title: kind === 'projects' ? 'No projects yet' : 'No templates yet', text: kind === 'projects' ? 'Projects you make will show here.' : 'Templates you save will show here.' }));
      return;
    }
    list.append(...items.map(row));
  }

  paintUsage();
  renderList();
  refreshQuota().then(paintUsage);
  syncNow();

  unsubscribers.push(onSyncState((s) => {
    if (s.status === 'ok') { paintUsage(); renderList(); }
  }));
  unsubscribers.push(onAuthChange((s) => { if (!s) ctx.navigate('/profile', { replace: true }); }));

  return function cleanup() {
    unsubscribers.forEach((fn) => fn());
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
}

