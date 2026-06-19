// Agentia File Store — IndexedDB-backed storage for large HTML reports
// Replaces chrome.storage.local for file content to avoid the 5 MB extension quota.

const DB_NAME = 'agentia_files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

export class FileStore {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('IndexedDB could not open'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'fileKey' });
          store.createIndex('updated', 'updated', { unique: false });
          store.createIndex('created', 'created', { unique: false });
        }
      };
    });
  }

  async saveFile(fileKey, { name, content, type, created, updated }) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const data = {
        fileKey,
        name: name || 'Untitled',
        content: content || '',
        type: type || 'text',
        created: created || Date.now(),
        updated: updated || Date.now()
      };
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error || new Error('IndexedDB save failed'));
    });
  }

  async getFile(fileKey) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(fileKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
  }

  async deleteFile(fileKey) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(fileKey);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('IndexedDB delete failed'));
    });
  }

  async listFiles() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('IndexedDB list failed'));
    });
  }

  // One-time migration from chrome.storage.local (old file keys start with agentia_file_)
  async migrateFromChromeStorage() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith('agentia_file_'));
    if (keys.length === 0) return 0;

    let migrated = 0;
    for (const key of keys) {
      const file = all[key];
      if (!file) continue;
      const existing = await this.getFile(key).catch(() => null);
      if (!existing) {
        await this.saveFile(key, {
          name: file.name,
          content: file.content,
          type: file.type,
          created: file.created || Date.now(),
          updated: file.updated || file.created || Date.now()
        });
        migrated++;
      }
    }
    // Remove migrated entries from chrome.storage.local to free quota
    if (migrated > 0) {
      await chrome.storage.local.remove(keys);
    }
    return migrated;
  }
}

// Singleton export for shared use
export const fileStore = new FileStore();
