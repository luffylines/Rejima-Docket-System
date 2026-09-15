const DB_NAME = 'rejima-docket-demo';
const DB_VERSION = 1;
const DOCS = 'documents';
const ACTIVITY = 'activity';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) {
        const docs = db.createObjectStore(DOCS, { keyPath: 'id' });
        docs.createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains(ACTIVITY)) {
        const activity = db.createObjectStore(ACTIVITY, { keyPath: 'id' });
        activity.createIndex('created_at', 'created_at');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function put(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listDemoDocuments() {
  const rows = await all(DOCS);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getDemoDocument(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS, 'readonly');
    const request = tx.objectStore(DOCS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDemoDocument(row) {
  return put(DOCS, row);
}

export async function patchDemoDocument(id, patch) {
  const current = await getDemoDocument(id);
  if (!current) throw new Error('Document not found');
  return put(DOCS, { ...current, ...patch, updated_at: new Date().toISOString() });
}

export async function listDemoActivity() {
  const rows = await all(ACTIVITY);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function addDemoActivity(action, docket, detail) {
  return put(ACTIVITY, {
    id: crypto.randomUUID(),
    action,
    docket_number: docket?.docket_number || null,
    document_title: docket?.title || null,
    detail: detail || null,
    actor_name: 'Demo Team Member',
    created_at: new Date().toISOString(),
  });
}

export function createDemoDocketNumber() {
  const year = new Date().getFullYear();
  const suffix = `${Date.now()}`.slice(-6);
  return `RDS-${year}-${suffix}`;
}
