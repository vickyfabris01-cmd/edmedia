// js/components/NameSheet.js

import { openSheet } from './BottomSheet.js';
import { TextField } from './TextField.js';
import { Button } from './Button.js';
import { checkName } from '../utils/naming.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `.name-sheet__actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }`;

// Resolves the chosen name, or null when dismissed.
// Save stays disabled until the name is available. Duplicates are never renamed silently.
export function openNameSheet({ title, label = 'Template name', initial = '', confirmLabel = 'Save', templates = [], ignoreId = null, preview = null } = {}) {
  injectStyle('name-sheet', CSS);
  return new Promise((resolve) => {
    let settled = false;
    function finish(value) { if (settled) return; settled = true; resolve(value); }
    const body = document.createElement('div');
    body.className = 'stack';
    if (preview) body.append(preview);
    const field = TextField({ label, value: initial, placeholder: 'Enter a name', maxLength: 60, onInput: validate });
    const cancel = Button({ label: 'Cancel', variant: 'secondary', onClick: () => sheet.close() });
    const save = Button({ label: confirmLabel, variant: 'primary', disabled: true, onClick: submit });
    const actions = document.createElement('div');
    actions.className = 'name-sheet__actions';
    actions.append(cancel, save);
    body.append(field.el, actions);
    function validate() {
      const status = checkName(field.input.value, templates, ignoreId);
      if (status === 'available') field.hint.set('success', 'Available');
      else if (status === 'taken') field.hint.set('danger', 'Name already taken. Choose another name.');
      else field.hint.set('neutral', '');
      field.setInvalid(status === 'taken');
      save.disabled = status !== 'available';
    }
    function submit() {
      if (save.disabled) return;
      finish(field.input.value.trim().replace(/\s+/g, ' '));
      sheet.close();
    }
    field.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const sheet = openSheet({ title, body, onClose: () => finish(null) });
    validate();
    field.input.focus();
    field.input.select();
  });
}
