// js/screens/home.js

import { TopBar } from '../components/TopBar.js';
import { UploadBox } from '../components/UploadBox.js';
import { SearchField } from '../components/SearchField.js';
import { Chip, setChipSelected } from '../components/Chip.js';
import { StatusHint } from '../components/StatusHint.js';
import { EmptyState } from '../components/EmptyState.js';
import { TemplateCard } from '../components/TemplateCard.js';
import { openTemplateSheet } from '../components/TemplateSheet.js';
import { openActionSheet } from '../components/ActionSheet.js';
import { openNameSheet } from '../components/NameSheet.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { showToast } from '../components/Toast.js';
import { listAllTemplates, ratioGroup, renameTemplate, duplicateTemplate, deleteTemplate, suggestName } from '../store/templates.js';
import { nameKey, checkName } from '../utils/naming.js';
import { pickImage } from '../utils/files.js';
import { setPendingPhoto } from '../state.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `.home-grid { align-items: start; }`;

const FILTERS = [['all', 'All'], ['recent', 'Recent'], ['square', 'Square'], ['portrait', 'Portrait'], ['story', 'Story'], ['wide', 'Wide']];
const RECENT_COUNT = 8;

export default async function home(view, params, ctx) {
  injectStyle('screen-home', CSS);

  let templates = [];
  let filter = 'all';
  let query = '';
  let disposers = [];

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({ title: 'Templates', large: true }));
  const body = document.createElement('div');
  body.className = 'screen__body stack';

  const upload = UploadBox({
    onFile(file) { setPendingPhoto(file); ctx.navigate('/editor/new'); },
    onReject(message) { showToast(message, 'danger'); },
  });
  const search = SearchField({ placeholder: 'Search templates', label: 'Search templates', onInput(value) { query = value; render(); } });

  const chipRow = document.createElement('div');
  chipRow.className = 'scroll-x scroll-x--fade';
  chipRow.setAttribute('role', 'group');
  chipRow.setAttribute('aria-label', 'Filter templates');
  const chips = new Map();
  FILTERS.forEach(([key, label]) => {
    const chip = Chip({
      label, selected: key === filter,
      onClick() { filter = key; chips.forEach((el, k) => setChipSelected(el, k === key)); render(); },
    });
    chips.set(key, chip);
    chipRow.append(chip);
  });

  const hint = StatusHint();
  const results = document.createElement('div');
  body.append(upload, search.el, chipRow, hint.el, results);
  root.append(body);
  view.append(root);

  function visible() {
    let list = templates;
    if (filter === 'recent') list = list.filter((t) => !t.builtin).slice(0, RECENT_COUNT);
    else if (filter !== 'all') list = list.filter((t) => ratioGroup(t.width, t.height) === filter);
    const q = nameKey(query);
    if (q) list = list.filter((t) => (t.nameKey || nameKey(t.name)).includes(q));
    return list;
  }

  function render() {
    disposers.forEach((fn) => fn());
    disposers = [];
    const list = visible();
    if (nameKey(query)) {
      const status = checkName(query, templates);
      hint.set(status === 'taken' ? 'danger' : 'success', list.length + ' found - name ' + (status === 'taken' ? 'already taken' : 'available'));
    } else {
      hint.set('neutral', '');
    }
    if (!list.length) {
      results.replaceChildren(EmptyState(
        nameKey(query) || filter !== 'all'
          ? { title: 'No matches', text: 'Try another name or filter.' }
          : { title: 'No templates yet', text: 'Edit a photo, then save it as a template to reuse it.' }
      ));
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'grid-2 home-grid';
    list.forEach((template) => {
      const card = TemplateCard({ template, onOpen: openDetail, onMore: openMore });
      disposers.push(card.dispose);
      grid.append(card.el);
    });
    results.replaceChildren(grid);
  }

  async function refresh() {
    templates = await listAllTemplates();
    render();
  }

  function failure(err, verb) {
    console.error(err);
    showToast(err && err.message === 'name-taken' ? 'That name is already taken. Choose another.' : 'Could not ' + verb + ' template.', 'danger');
  }

  // The photo picker must open straight from the tap, so it runs first
  async function use(template) {
    const file = await pickImage();
    if (!file) return;
    setPendingPhoto(file);
    ctx.navigate('/slot/' + encodeURIComponent(template.id));
  }

  async function rename(template) {
    const name = await openNameSheet({ title: 'Rename template', initial: template.name, confirmLabel: 'Rename', templates, ignoreId: template.id });
    if (!name) return;
    try { await renameTemplate(template.id, name); await refresh(); showToast('Template renamed'); } catch (err) { failure(err, 'rename'); }
  }

  async function duplicate(template) {
    const name = await openNameSheet({ title: 'Duplicate template', initial: suggestName(template.name, templates), confirmLabel: 'Duplicate', templates });
    if (!name) return;
    try { await duplicateTemplate(template.id, name); await refresh(); showToast('Template duplicated'); } catch (err) { failure(err, 'duplicate'); }
  }

  async function remove(template) {
    const ok = await confirmDialog({ title: 'Delete template?', text: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await deleteTemplate(template.id); await refresh(); showToast('Template deleted'); } catch (err) { failure(err, 'delete'); }
  }

  function openDetail(template) {
    openTemplateSheet({ template, onUse: use, onRename: rename, onDuplicate: duplicate, onDelete: remove });
  }

  function openMore(template) {
    const actions = [{ label: 'Use template', onSelect: () => use(template) }];
    if (!template.builtin) actions.push({ label: 'Rename', onSelect: () => rename(template) });
    actions.push({ label: template.builtin ? 'Duplicate as my template' : 'Duplicate', onSelect: () => duplicate(template) });
    if (!template.builtin) actions.push({ label: 'Delete', danger: true, onSelect: () => remove(template) });
    openActionSheet({ title: template.name, actions });
  }

  try {
    templates = await listAllTemplates();
  } catch (err) {
    console.error('Could not load templates', err);
    results.replaceChildren(EmptyState({ title: 'Could not load templates', text: 'Close the app and open it again.' }));
    return;
  }
  render();

  return function cleanup() {
    disposers.forEach((fn) => fn());
    disposers = [];
  };
}
