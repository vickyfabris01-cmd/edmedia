// js/utils/format.js

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return (value >= 100 ? Math.round(value) : value.toFixed(1)) + ' ' + units[i];
}

// "just now", "12 min ago", "3 h ago", "yesterday", "4 d ago", then a date
export function formatRelative(ts) {
  if (!ts) return '';
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' h ago';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' d ago';
  return formatDate(ts);
}
