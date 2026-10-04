// js/state.js

// Short-lived values handed from one screen to the next.
let pendingPhoto = null;
let pendingAuthMode = null;

export function setPendingPhoto(file) { pendingPhoto = file; }
export function takePendingPhoto() { const f = pendingPhoto; pendingPhoto = null; return f; }
export function setPendingAuthMode(mode) { pendingAuthMode = mode; }
export function takePendingAuthMode() { const m = pendingAuthMode; pendingAuthMode = null; return m; }
