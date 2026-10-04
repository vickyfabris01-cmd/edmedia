// js/screens/brand.js

import { TopBar } from '../components/TopBar.js';
import { IconButton } from '../components/IconButton.js';
import { EmptyState } from '../components/EmptyState.js';
import { Button } from '../components/Button.js';
import { openActionSheet } from '../components/ActionSheet.js';
import { openNameSheet } from '../components/NameSheet.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { showToast } from '../components/Toast.js';
import { listAssets, addAsset, renameAsset, deleteAsset } from '../store/assets.js';
import { pickImage } from '../utils/files.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.brand-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.brand-item { display: flex; flex-direction: column; gap: var(--space-1); text-align: left; }
.brand-item__img { aspect-ratio: 1; border-radius: var(--radius-md); border: 1px solid var(--color-border); overflow: hidden;
  background: conic-gradient(var(--color-surface-2) 25%, var(--color-surface-3) 0 50%, var(--color-surface-2) 0 75%, var(--color-surface-3) 0) 0 0 / 16px 16px; }
.brand-item__img img { width: 100%; height: 100%; object-fit: contain; }
.brand-item__name { font-size: var(--text-caption); font-weight: var(--weight-semibold); }`;

export default async function brand(view, params, ctx) {
  injectStyle('screen-brand', CSS);
  let items = [];
  let urls = [];

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({
    title: 'Brand library',
    onBack: () => ctx.back('/profile'),
    actions: [IconButton({ icon: 'plus', label: 'Add logo', onClick: add })],
  }));
  const body = document.createElement('div');
  body.className = 'screen__body stack';
  const results = document.createElement('div');
  body.append(results);
  root.append(body);
  view.append(root);

  async function add() {
    const file = await pickImage();
    if (!file) return;
    try {
      const base = (file.name || 'Logo').replace(/\.[^.]+$/, '').slice(0, 40) || 'Logo';
      await addAsset(file, base);
      await refresh();
      showToast('Logo added');
    } catch (err) {
      console.error(err);
      showToast('Could not add this image.', 'danger');
    }
  }

  function render() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    if (!items.length) {
      results.replaceChildren(EmptyState({
        title: 'No logos yet', text: 'Add your crest or logo to use it as a watermark in any template.',
        action: Button({ label: 'Add logo', variant: 'primary', onClick: add }),
      }));
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'brand-grid';
    items.forEach((asset) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'brand-item';
      item.setAttribute('aria-label', 'Actions for ' + asset.name);
      const box = document.createElement('div');
      box.className = 'brand-item__img';
      if (asset.blob instanceof Blob) {
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        const img = document.createElement('img');
        img.alt = '';
        img.src = url;
        box.append(img);
      }
      const name = document.createElement('div');
      name.className = 'brand-item__name truncate';
      name.textContent = asset.name;
      item.append(box, name);
      item.addEventListener('click', () => more(asset));
      grid.append(item);
    });
    results.replaceChildren(grid);
  }

  async function refresh() { items = await listAssets(); render(); }

  function more(asset) {
    openActionSheet({
      title: asset.name,
      actions: [
        { label: 'Rename', onSelect: () => rename(asset) },
        { label: 'Delete', danger: true, onSelect: () => remove(asset) },
      ],
    });
  }

  async function rename(asset) {
    const name = await openNameSheet({ title: 'Rename logo', label: 'Logo name', initial: asset.name, confirmLabel: 'Rename', templates: items, ignoreId: asset.id });
    if (!name) return;
    try { await renameAsset(asset.id, name); await refresh(); showToast('Logo renamed'); }
    catch (err) { console.error(err); showToast('Could not rename this logo.', 'danger'); }
  }

  async function remove(asset) {
    const ok = await confirmDialog({
      title: 'Delete logo?', text: 'Watermarks already placed on projects keep working until you reopen them.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await deleteAsset(asset.id); await refresh(); showToast('Logo deleted'); }
    catch (err) { console.error(err); showToast('Could not delete this logo.', 'danger'); }
  }

  try {
    items = await listAssets();
  } catch (err) {
    console.error(err);
    results.replaceChildren(EmptyState({ title: 'Could not load logos', text: 'Close the app and open it again.' }));
    return;
  }
  render();
  return function cleanup() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
}
