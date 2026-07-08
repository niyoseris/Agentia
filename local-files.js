// Agentia Local Files — File System Access API bridge (side-panel context only)
// The user grants access to specific files/folders via a picker; handles persist
// in IndexedDB (FileSystemHandle is structured-cloneable). The agent (in the
// service worker) reaches these through LOCAL_FILE_* messages forwarded to the
// panel. Works ONLY while the panel is open — the browser requires a window
// context + user gesture for File System Access.

const DB_NAME = 'agentia_local_files';
const DB_VERSION = 1;
const STORE = 'handles';
const MAX_READ_BYTES = 20 * 1024 * 1024; // 20MB safety cap

let _db = null;
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error || new Error('local-files DB açılamadı'));
  });
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB isteği başarısız'));
  });
}

async function _saveEntry(entry) {
  const db = await openDB();
  await _req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
  return entry;
}

export async function listHandles() {
  const db = await openDB();
  const all = await _req(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  return all.map(e => ({ id: e.id, name: e.name, kind: e.kind, mode: e.mode }));
}

async function getEntry(id) {
  const db = await openDB();
  return _req(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
}

export async function removeHandle(id) {
  const db = await openDB();
  await _req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  return true;
}

// ---- Pickers (require a user gesture) ----
export async function pickFiles() {
  if (!self.showOpenFilePicker) throw new Error('Tarayıcınız File System Access API desteklemiyor');
  const handles = await self.showOpenFilePicker({ multiple: true });
  const saved = [];
  for (const handle of handles) {
    const entry = {
      id: `lf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: handle.name, kind: 'file', mode: 'readwrite', handle
    };
    await _saveEntry(entry);
    saved.push({ id: entry.id, name: entry.name, kind: entry.kind });
  }
  return saved;
}

export async function pickDirectory() {
  if (!self.showDirectoryPicker) throw new Error('Tarayıcınız File System Access API desteklemiyor');
  const handle = await self.showDirectoryPicker({ mode: 'readwrite' });
  const entry = {
    id: `lf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: handle.name, kind: 'directory', mode: 'readwrite', handle
  };
  await _saveEntry(entry);
  return { id: entry.id, name: entry.name, kind: entry.kind };
}

// ---- Permission ----
async function ensurePermission(handle, mode = 'read') {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  throw new Error('Dosya erişim izni verilmedi. Panelden dosyayı yeniden seçin.');
}

// Resolve a nested file handle from a directory + relative path (a/b/c.txt)
async function resolveFileInDir(dirHandle, path, create = false) {
  const parts = path.split('/').filter(Boolean);
  let dir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create });
}

// ---- Agent-facing operations (dispatched from the message bridge) ----
export async function listOp({ handleId }) {
  if (!handleId) return { handles: await listHandles() };
  const entry = await getEntry(handleId);
  if (!entry) throw new Error(`Yetkili dosya bulunamadı: ${handleId}`);
  if (entry.kind !== 'directory') return { name: entry.name, kind: 'file' };
  await ensurePermission(entry.handle, 'read');
  const items = [];
  for await (const [name, h] of entry.handle.entries()) {
    items.push({ name, kind: h.kind });
    if (items.length >= 500) break;
  }
  return { name: entry.name, kind: 'directory', entries: items };
}

export async function readOp({ handleId, path }) {
  const entry = await getEntry(handleId);
  if (!entry) throw new Error(`Yetkili dosya bulunamadı: ${handleId}`);
  await ensurePermission(entry.handle, 'read');
  let fileHandle;
  if (entry.kind === 'directory') {
    if (!path) throw new Error('Klasör için okunacak dosya yolu (path) gerekli');
    fileHandle = await resolveFileInDir(entry.handle, path, false);
  } else {
    fileHandle = entry.handle;
  }
  const file = await fileHandle.getFile();
  if (file.size > MAX_READ_BYTES) throw new Error(`Dosya çok büyük (${Math.round(file.size / 1024 / 1024)}MB, limit 20MB)`);
  const text = await file.text();
  return { name: file.name, size: file.size, text };
}

export async function writeOp({ handleId, path, content }) {
  const entry = await getEntry(handleId);
  if (!entry) throw new Error(`Yetkili dosya bulunamadı: ${handleId}`);
  await ensurePermission(entry.handle, 'readwrite');
  let fileHandle;
  if (entry.kind === 'directory') {
    if (!path) throw new Error('Klasör için yazılacak dosya yolu (path) gerekli');
    fileHandle = await resolveFileInDir(entry.handle, path, true);
  } else {
    fileHandle = entry.handle;
  }
  const writable = await fileHandle.createWritable();
  await writable.write(content ?? '');
  await writable.close();
  return { name: fileHandle.name, written: (content ?? '').length };
}

// Dispatch a bridged request from the service worker
export async function handleLocalFileRequest(op, payload) {
  switch (op) {
    case 'list': return listOp(payload);
    case 'read': return readOp(payload);
    case 'write': return writeOp(payload);
    default: throw new Error(`Bilinmeyen yerel dosya işlemi: ${op}`);
  }
}
