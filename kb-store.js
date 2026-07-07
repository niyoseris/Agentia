// Agentia KB Store — IndexedDB-backed storage for knowledge bases, documents, and chunks
// Separate DB from agentia_files so schema versions don't entangle.
// Embeddings are stored as Float32Array (structured clone handles typed arrays natively).

const DB_NAME = 'agentia_kb';
const DB_VERSION = 1;

export class KbStore {
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
        if (!db.objectStoreNames.contains('kbs')) {
          db.createObjectStore('kbs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('docs')) {
          const docs = db.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('kbId', 'kbId', { unique: false });
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const chunks = db.createObjectStore('chunks', { keyPath: 'id' });
          chunks.createIndex('kbId', 'kbId', { unique: false });
          chunks.createIndex('docId', 'docId', { unique: false });
        }
      };
    });
  }

  _tx(storeNames, mode) {
    return this.db.transaction(storeNames, mode);
  }

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  _getAllByIndex(storeName, indexName, key) {
    const store = this._tx(storeName, 'readonly').objectStore(storeName);
    return this._req(store.index(indexName).getAll(key));
  }

  // ---- Knowledge Bases ----
  async createKb({ name, description = '' }) {
    await this.open();
    const kb = {
      id: `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: (name || 'Adsız').substring(0, 100),
      description: (description || '').substring(0, 500),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await this._req(this._tx('kbs', 'readwrite').objectStore('kbs').put(kb));
    return kb;
  }

  async updateKb(id, patch) {
    await this.open();
    const store = this._tx('kbs', 'readwrite').objectStore('kbs');
    const kb = await this._req(store.get(id));
    if (!kb) throw new Error(`KB bulunamadı: ${id}`);
    const updated = { ...kb, ...patch, id, updatedAt: Date.now() };
    await this._req(store.put(updated));
    return updated;
  }

  // Deletes a KB and cascades its docs + chunks
  async deleteKb(id) {
    await this.open();
    const docs = await this._getAllByIndex('docs', 'kbId', id);
    const tx = this._tx(['kbs', 'docs', 'chunks'], 'readwrite');
    tx.objectStore('kbs').delete(id);
    for (const doc of docs) tx.objectStore('docs').delete(doc.id);
    const chunkIndex = tx.objectStore('chunks').index('kbId');
    const chunkKeys = await this._req(chunkIndex.getAllKeys(id));
    for (const key of chunkKeys) tx.objectStore('chunks').delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('KB silme başarısız'));
    });
  }

  async getKb(id) {
    await this.open();
    return this._req(this._tx('kbs', 'readonly').objectStore('kbs').get(id));
  }

  // Lists KBs with document and chunk counts
  async listKbs() {
    await this.open();
    const kbs = await this._req(this._tx('kbs', 'readonly').objectStore('kbs').getAll());
    const result = [];
    for (const kb of kbs) {
      const docs = await this._getAllByIndex('docs', 'kbId', kb.id);
      const chunkCount = docs.reduce((sum, d) => sum + (d.chunkCount || 0), 0);
      result.push({ ...kb, docCount: docs.length, chunkCount });
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ---- Documents ----
  async addDoc(meta) {
    await this.open();
    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kbId: meta.kbId,
      name: (meta.name || 'Adsız doküman').substring(0, 200),
      sourceType: meta.sourceType || 'text', // 'text' | 'file' | 'pdf' | 'page'
      sourceUrl: meta.sourceUrl || '',
      charCount: meta.charCount || 0,
      chunkCount: meta.chunkCount || 0,
      embedStatus: meta.embedStatus || 'pending', // 'pending' | 'partial' | 'done' | 'failed' | 'none'
      embeddingModel: meta.embeddingModel || '',
      createdAt: Date.now()
    };
    await this._req(this._tx('docs', 'readwrite').objectStore('docs').put(doc));
    return doc;
  }

  async updateDoc(id, patch) {
    await this.open();
    const store = this._tx('docs', 'readwrite').objectStore('docs');
    const doc = await this._req(store.get(id));
    if (!doc) throw new Error(`Doküman bulunamadı: ${id}`);
    const updated = { ...doc, ...patch, id };
    await this._req(store.put(updated));
    return updated;
  }

  async getDoc(id) {
    await this.open();
    return this._req(this._tx('docs', 'readonly').objectStore('docs').get(id));
  }

  async deleteDoc(id) {
    await this.open();
    const tx = this._tx(['docs', 'chunks'], 'readwrite');
    tx.objectStore('docs').delete(id);
    const chunkKeys = await this._req(tx.objectStore('chunks').index('docId').getAllKeys(id));
    for (const key of chunkKeys) tx.objectStore('chunks').delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Doküman silme başarısız'));
    });
  }

  async listDocs(kbId) {
    await this.open();
    const docs = await this._getAllByIndex('docs', 'kbId', kbId);
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ---- Chunks ----
  // Bulk insert in a single transaction
  async putChunks(chunks) {
    await this.open();
    const tx = this._tx('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    for (const chunk of chunks) store.put(chunk);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(chunks.length);
      tx.onerror = () => reject(tx.error || new Error('Chunk kaydı başarısız'));
    });
  }

  async updateChunkEmbedding(chunkId, embedding, model) {
    await this.open();
    const store = this._tx('chunks', 'readwrite').objectStore('chunks');
    const chunk = await this._req(store.get(chunkId));
    if (!chunk) return null;
    chunk.embedding = embedding;
    chunk.model = model;
    chunk.dim = embedding ? embedding.length : 0;
    await this._req(store.put(chunk));
    return chunk;
  }

  async getChunksByKbIds(kbIds) {
    await this.open();
    const all = [];
    for (const kbId of kbIds) {
      const chunks = await this._getAllByIndex('chunks', 'kbId', kbId);
      all.push(...chunks);
    }
    return all;
  }

  async getChunksByDoc(docId) {
    await this.open();
    return this._getAllByIndex('chunks', 'docId', docId);
  }

  async getPendingChunks(docId) {
    const chunks = await this.getChunksByDoc(docId);
    return chunks.filter(c => !c.embedding);
  }

  // Docs whose embedding was interrupted (for resume after SW restart)
  async getAllPendingDocs() {
    await this.open();
    const docs = await this._req(this._tx('docs', 'readonly').objectStore('docs').getAll());
    return docs.filter(d => d.embedStatus === 'pending' || d.embedStatus === 'partial');
  }
}

// Singleton export for shared use
export const kbStore = new KbStore();
