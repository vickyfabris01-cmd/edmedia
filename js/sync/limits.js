// js/sync/limits.js

// The server has the same numbers in the sync_limits table; the app asks the server for the real values
// and uses these only until it has an answer.
export const QUOTA_BYTES = 50 * 1024 * 1024;   // cloud space for each user
export const AUTO_DELETE_AT = 0.98;            // at this share of the space, the oldest synced projects are removed
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024; // largest photo or logo that is uploaded
export const EXPIRE_DAYS = 90;                 // cloud copies not edited for this long are removed
export const BUCKET = 'sync-media';

