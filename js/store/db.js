// js/store/db.js

const DB_NAME = 'edmedia';
const DB_VERSION = 2;

let dbPromise = null;

// Every synced record carries: id, updatedAt, deleted.
function upgrade(db) {
  const make = (name, options, indexes = []) => {
    if (db.objectStoreNames.contains(name)) return;
    const store = db.createObjectStore(name, options);
    indexes.forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath));
  };
  make('templates', { keyPath: 'id' }, [['nameKey', 'nameKey'], ['updatedAt', 'updatedAt']]);
  make('projects', { keyPath: 'id' }, [['templateId', 'templateId'], ['updatedAt', 'updatedAt']]);
  make('photos', { keyPath: 'id' });
  make('assets', { keyPath: 'id' }, [['updatedAt', 'updatedAt']]);
  make('presets', { keyPath: 'id' }, [['updatedAt', 'updatedAt']]);
  make('settings', { keyPath: 'key' });
  make('meta', { keyPath: 'key' });
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const dbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const dbGetAll = (store) => run(store, 'readonly', (s) => s.getAll());
// The sync engine listens here so local edits are uploaded soon. Its own writes pass { silent: true }.
let writeHook = null;
export function setWriteHook(fn) { writeHook = fn; }

export async function dbPut(store, value, { silent = false } = {}) {
  const result = await run(store, 'readwrite', (s) => s.put(value));
  if (!silent && writeHook && store !== 'photos' && store !== 'meta') writeHook(store);
  return result;
}
export const dbDelete = (store, key) => run(store, 'readwrite', (s) => s.delete(key));