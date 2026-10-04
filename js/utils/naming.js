// js/utils/naming.js

// Names match when they are equal after trimming, collapsing spaces, and ignoring case.
export function nameKey(name) {
  return String(name).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Returns 'empty' | 'taken' | 'available'.
// ignoreId lets a record keep its own name when it is being renamed.
export function checkName(name, records, ignoreId = null) {
  const key = nameKey(name);
  if (!key) return 'empty';
  const taken = records.some(
    (t) => !t.deleted && t.id !== ignoreId && (t.nameKey || nameKey(t.name)) === key
  );
  return taken ? 'taken' : 'available';
}
