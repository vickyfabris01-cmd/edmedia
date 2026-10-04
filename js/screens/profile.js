// js/screens/profile.js

import { TopBar } from '../components/TopBar.js';
import { Button } from '../components/Button.js';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { SettingsGroup } from '../components/SettingsGroup.js';
import { SettingsRow } from '../components/SettingsRow.js';
import { openChoiceSheet } from '../components/ChoiceSheet.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { showToast } from '../components/Toast.js';
import { icon } from '../icons.js';
import { getThemePref, setThemePref } from '../utils/theme.js';
import { getSetting, setSetting } from '../store/settings.js';
import { dbGetAll } from '../store/db.js';
import { formatBytes, formatRelative } from '../utils/format.js';
import { SOCIAL_PRESETS, getSocialPreset } from '../utils/social-presets.js';
import { isConfigured, getSession, signOut, onAuthChange } from '../sync/auth.js';
import { getSyncState, onSyncState, syncNow, deleteCloudData, getQuota, refreshQuota } from '../sync/sync.js';
import { setPendingAuthMode } from '../state.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.profile-head { display: flex; align-items: center; gap: var(--space-3); }
.profile-avatar { display: grid; place-items: center; flex: none; width: 56px; height: 56px; border-radius: var(--radius-pill); background: var(--color-surface-3); color: var(--color-text-secondary); }
.profile-avatar .icon { width: 28px; height: 28px; }
.profile-pill { display: inline-flex; align-items: center; gap: var(--space-1); margin-top: 2px; padding: 2px var(--space-2); border-radius: var(--radius-pill);
  background: var(--color-surface-2); color: var(--color-text-secondary); font-size: var(--text-tiny); font-weight: var(--weight-semibold); }
.profile-pill--ok { background: var(--color-success-soft); color: var(--color-success); }
.profile-pill--bad { background: var(--color-danger-soft); color: var(--color-danger); }
.profile-sync { display: flex; flex-direction: column; gap: var(--space-3); }
.profile-sync__text { color: var(--color-text-secondary); }`;

const FORMATS = [{ value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }];
const QUALITIES = [0.6, 0.7, 0.8, 0.9, 1].map((q) => ({ value: q, label: Math.round(q * 100) + '%' }));
const formatLabel = (v) => (FORMATS.find((f) => f.value === v) || FORMATS[0]).label;

export default async function profile(view, params, ctx) {
  injectStyle('screen-profile', CSS);
  const unsubscribers = [];

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({ title: 'Profile', large: true }));
  const body = document.createElement('div');
  body.className = 'screen__body stack stack--loose';
  root.append(body);
  view.append(root);

  // ---------- Settings that do not depend on the account ----------
  let exportFormat = 'jpeg';
  let exportQuality = 0.9;
  let socialPreset = 'none';
  try {
    [exportFormat, exportQuality, socialPreset] = await Promise.all([getSetting('exportFormat'), getSetting('exportQuality'), getSetting('socialPreset')]);
  } catch (err) { console.warn('Could not read settings, using defaults', err); }

  async function choose(key, title, options, current, apply) {
    const chosen = await openChoiceSheet({ title, options, value: current });
    if (chosen === null || chosen === current) return;
    try { await setSetting(key, chosen); apply(chosen); }
    catch (err) { console.error(err); showToast('Could not save this setting.', 'danger'); }
  }

  const theme = SegmentedControl({
    ariaLabel: 'Theme', value: getThemePref(),
    options: [{ value: 'device', label: 'Device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
    onChange: (value) => setThemePref(value),
  });
  const formatRow = SettingsRow({ label: 'Export format', value: formatLabel(exportFormat), onClick: () => choose('exportFormat', 'Export format', FORMATS, exportFormat, (v) => { exportFormat = v; formatRow.setValue(formatLabel(v)); }) });
  const qualityRow = SettingsRow({ label: 'Quality', value: Math.round(exportQuality * 100) + '%', onClick: () => choose('exportQuality', 'Export quality', QUALITIES, exportQuality, (v) => { exportQuality = v; qualityRow.setValue(Math.round(v * 100) + '%'); }) });
  const presetRow = SettingsRow({ label: 'Social preset', value: getSocialPreset(socialPreset).label, onClick: () => choose('socialPreset', 'Social preset', SOCIAL_PRESETS, socialPreset, (v) => { socialPreset = v; presetRow.setValue(getSocialPreset(v).label); }) });

  let assetCount = 0;
  try { assetCount = (await dbGetAll('assets')).filter((a) => !a.deleted).length; } catch (err) { console.warn('Could not count brand assets', err); }
  const libraryRow = SettingsRow({ label: 'Brand library', value: String(assetCount), onClick: () => ctx.navigate('/brand') });

  const usedRow = SettingsRow({ label: 'Used on this device', value: '' });
  async function refreshUsage() {
    try {
      const estimate = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      usedRow.setValue(estimate && estimate.usage != null ? formatBytes(estimate.usage) : 'Unavailable');
    } catch { usedRow.setValue('Unavailable'); }
  }
  async function clearCache() {
    const ok = await confirmDialog({
      title: 'Clear cached files?',
      text: 'Saved app files are removed and downloaded again when you are online. Your projects, templates, and brand assets are not affected.',
      confirmLabel: 'Clear cache', danger: true,
    });
    if (!ok) return;
    try {
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
      showToast('Cache cleared');
      refreshUsage();
    } catch (err) { console.error(err); showToast('Could not clear the cache.', 'danger'); }
  }
  const clearRow = SettingsRow({ label: 'Clear cache', onClick: clearCache });

  // ---------- Account section (changes when you sign in or out) ----------
  const accountHost = document.createElement('div');
  accountHost.className = 'stack stack--loose';
  const settingsHost = document.createElement('div');
  settingsHost.className = 'stack stack--loose';
  settingsHost.append(
    SettingsGroup({ title: 'Appearance', items: [theme.el], padded: true }),
    SettingsGroup({ title: 'Defaults', items: [formatRow.el, qualityRow.el, presetRow.el] }),
    SettingsGroup({ title: 'Brand', items: [libraryRow.el] }),
    SettingsGroup({ title: 'Storage', items: [usedRow.el, clearRow.el] })
  );
  body.append(accountHost, settingsHost);

  const STATUS = {
    off: ['Not syncing', ''], idle: ['Ready to sync', ''], syncing: ['Syncing...', ''],
    ok: ['Synced', 'ok'], offline: ['Offline', 'bad'], error: ['Sync failed', 'bad'],
  };

  function renderAccount() {
    accountHost.replaceChildren();
    const session = getSession();

    const head = document.createElement('div');
    head.className = 'profile-head';
    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar';
    avatar.innerHTML = icon('profile');
    const who = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'text-h2';
    name.textContent = session ? session.user.email : 'Guest';
    const sub = document.createElement('div');
    sub.className = 'text-caption text-secondary';
    who.append(name, sub);
    head.append(avatar, who);

    if (!session) {
      sub.textContent = 'Working offline. Everything is saved on this device.';
      accountHost.append(head);
      const card = document.createElement('div');
      card.className = 'profile-sync';
      const title = document.createElement('div');
      title.className = 'text-h2';
      title.textContent = 'Work offline, sync later';
      const text = document.createElement('p');
      text.className = 'profile-sync__text';
      text.textContent = isConfigured()
        ? 'Sign in to back up your projects, templates, and brand logos, and use them on another device.'
        : 'Cloud sync is not set up in this build yet. Everything works on this device.';
      card.append(title, text);
      if (isConfigured()) card.append(Button({ label: 'Sign in to sync', variant: 'primary', full: true, onClick: () => ctx.navigate('/auth') }));
      accountHost.append(SettingsGroup({ items: [card], padded: true }));
      return;
    }

    const pill = document.createElement('span');
    pill.className = 'profile-pill';
    sub.append(pill);
    accountHost.append(head);

    const lastRow = SettingsRow({ label: 'Last synced', value: '' });
    function paintState(s) {
      const [text, kind] = STATUS[s.status] || STATUS.idle;
      pill.className = 'profile-pill' + (kind ? ' profile-pill--' + kind : '');
      pill.textContent = text + (s.status === 'error' && s.message ? ': ' + s.message : '');
      lastRow.setValue(s.at ? formatRelative(s.at) : 'Not yet');
    }
    paintState(getSyncState());
    unsubscribers.push(onSyncState(paintState));

    const spaceRow = SettingsRow({ label: 'Cloud space', value: '' });
    function paintSpace() {
      const q = getQuota();
      spaceRow.setValue(formatBytes(q.used) + ' of ' + formatBytes(q.limit));
    }
    paintSpace();
    refreshQuota().then(paintSpace);
    unsubscribers.push(onSyncState((s) => { if (s.status === 'ok') paintSpace(); }));

    const syncRow = SettingsRow({ label: 'Sync now', onClick: () => syncNow() });
    const manageRow = SettingsRow({ label: 'Manage synced projects and templates', onClick: () => ctx.navigate('/sync') });
    const passwordRow = SettingsRow({ label: 'Change password', onClick: () => { setPendingAuthMode('change'); ctx.navigate('/auth'); } });
    const deleteRow = SettingsRow({
      label: 'Delete cloud data', danger: true,
      async onClick() {
        const ok = await confirmDialog({
          title: 'Delete cloud data?',
          text: 'Everything synced to your account is removed from the cloud. Everything on this device stays, and projects and templates will not sync again until you sync them from Manage.',
          confirmLabel: 'Delete', danger: true,
        });
        if (!ok) return;
        try { await deleteCloudData(); showToast('Cloud data deleted'); }
        catch (err) { console.error(err); showToast('Could not delete cloud data.', 'danger'); }
      },
    });
    const outRow = SettingsRow({ label: 'Sign out', onClick: () => { signOut(); showToast('Signed out'); } });
    accountHost.append(
      SettingsGroup({ title: 'Sync', items: [syncRow.el, lastRow.el, spaceRow.el, manageRow.el] }),
      SettingsGroup({ title: 'Account', items: [passwordRow.el, outRow.el] }),
      SettingsGroup({ items: [deleteRow.el] })
    );
  }

  renderAccount();
  unsubscribers.push(onAuthChange(() => {
    // Subscriptions made for the old account view are replaced
    renderAccount();
  }));
  refreshUsage();

  return function cleanup() {
    unsubscribers.forEach((fn) => fn());
  };
}