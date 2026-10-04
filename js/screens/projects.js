// js/screens/projects.js

import { TopBar } from '../components/TopBar.js';
import { SearchField } from '../components/SearchField.js';
import { EmptyState } from '../components/EmptyState.js';
import { Button } from '../components/Button.js';
import { ProjectCard } from '../components/ProjectCard.js';
import { openActionSheet } from '../components/ActionSheet.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { showToast } from '../components/Toast.js';
import { listProjects, duplicateProject, deleteProject } from '../store/projects.js';
import { nameKey } from '../utils/naming.js';
import { pickImage } from '../utils/files.js';
import { setPendingPhoto } from '../state.js';

export default async function projects(view, params, ctx) {
  let items = [];
  let query = '';
  let disposers = [];

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({ title: 'Projects', large: true }));
  const body = document.createElement('div');
  body.className = 'screen__body stack';
  const search = SearchField({ placeholder: 'Search projects', label: 'Search projects', onInput(value) { query = value; render(); } });
  const results = document.createElement('div');
  results.className = 'stack stack--tight';
  body.append(search.el, results);
  root.append(body);
  view.append(root);

  async function newEdit() {
    const file = await pickImage();
    if (!file) return;
    setPendingPhoto(file);
    ctx.navigate('/editor/new');
  }

  function visible() {
    const q = nameKey(query);
    if (!q) return items;
    return items.filter((p) => nameKey(p.name).includes(q) || nameKey(p.templateName || '').includes(q));
  }

  function render() {
    disposers.forEach((fn) => fn());
    disposers = [];
    search.el.hidden = items.length === 0;
    const list = visible();
    if (!items.length) {
      results.replaceChildren(EmptyState({
        title: 'No projects yet', text: 'Your in-progress edits will appear here.',
        action: Button({ label: 'New edit', variant: 'primary', onClick: newEdit }),
      }));
      return;
    }
    if (!list.length) { results.replaceChildren(EmptyState({ title: 'No matches', text: 'Try another name.' })); return; }
    const cards = list.map((project) => {
      const card = ProjectCard({ project, onOpen: openProject, onMore: openMore });
      disposers.push(card.dispose);
      return card.el;
    });
    results.replaceChildren(...cards);
  }

  async function refresh() { items = await listProjects(); render(); }
  function openProject(project) { ctx.navigate('/editor/' + encodeURIComponent(project.id)); }

  async function duplicate(project) {
    try { await duplicateProject(project.id); await refresh(); showToast('Project duplicated'); }
    catch (err) { console.error(err); showToast('Could not duplicate project.', 'danger'); }
  }

  async function remove(project) {
    const ok = await confirmDialog({ title: 'Delete project?', text: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await deleteProject(project.id); await refresh(); showToast('Project deleted'); }
    catch (err) { console.error(err); showToast('Could not delete project.', 'danger'); }
  }

  function openMore(project) {
    openActionSheet({
      title: project.name,
      actions: [
        { label: 'Open', onSelect: () => openProject(project) },
        { label: 'Duplicate', onSelect: () => duplicate(project) },
        { label: 'Delete', danger: true, onSelect: () => remove(project) },
      ],
    });
  }

  try {
    items = await listProjects();
  } catch (err) {
    console.error('Could not load projects', err);
    results.replaceChildren(EmptyState({ title: 'Could not load projects', text: 'Close the app and open it again.' }));
    return;
  }
  render();
  return function cleanup() { disposers.forEach((fn) => fn()); disposers = []; };
}
