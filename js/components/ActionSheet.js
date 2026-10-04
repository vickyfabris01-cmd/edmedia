// js/components/ActionSheet.js

import { openSheet } from './BottomSheet.js';
import { Button } from './Button.js';

// actions: [{ label, danger, onSelect }]. The sheet closes first, then onSelect runs.
export function openActionSheet({ title = '', actions = [] } = {}) {
  const body = document.createElement('div');
  body.className = 'stack stack--tight';
  const sheet = openSheet({ title, body });
  actions.forEach((action) => {
    body.append(Button({
      label: action.label, variant: action.danger ? 'danger' : 'secondary', full: true,
      onClick: () => { sheet.close(); if (action.onSelect) action.onSelect(); },
    }));
  });
  return sheet;
}
