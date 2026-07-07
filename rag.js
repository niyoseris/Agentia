// Agentia RAG Engine — chunking, Ollama embeddings, hybrid retrieval
// Vector search via /api/embed when an embedding model is available;
// automatic keyword (BM25-lite) fallback otherwise.

import { extractKeywords } from './memory-store.js';

const EMBED_BATCH_SIZE = 16;
const EMBED_FAIL_CACHE_MS = 60000;
const MAX_CHUNKS_PER_DOC = 2000;

// ---- Chunking ----
// Splits on markdown headings + blank lines, packs paragraphs to ~targetSize chars,
// carries a sentence-aligned overlap tail into the next chunk.
export function chunkText(text, { targetSize = 1200, maxSize = 1600, overlap = 200, meta = {} } = {}) {
  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];

  // Split into paragraphs, keeping markdown headings as boundaries
  const paragraphs = normalized.split(/\n(?=#{1,6}\s)|\n\n+/).map(p => p.trim()).filter(Boolean);

  const chunks = [];
  let current = '';

  const push = () => {
    if (current.trim().length > 0) chunks.push({ text: current.trim(), meta: { ...meta } });
    current = '';
  };

  for (const para of paragraphs) {
    // Oversized paragraph: hard-split on sentence boundaries
    if (para.length > maxSize) {
      push();
      const sentences = para.split(/(?<=[.!?…])\s+/);
      for (const sentence of sentences) {
        if (current.length + sentence.length + 1 > targetSize && current.length > 0) {
          const tail = overlapTail(current, overlap);
          push();
          current = tail;
        }
        current += (current ? ' ' : '') + sentence;
      }
      continue;
    }
    if (current.length + para.length + 2 > targetSize && current.length > 0) {
      const tail = overlapTail(current, overlap);
      push();
      current = tail;
    }
    current += (current ? '\n\n' : '') + para;
  }
  push();

  // Merge a trailing tiny chunk into the previous one
  if (chunks.length >= 2 && chunks[chunks.length - 1].text.length < 200) {
    const last = chunks.pop();
    chunks[chunks.length - 1].text += '\n\n' + last.text;
  }
  return chunks;
}

// Sentence-aligned overlap tail from the end of a chunk
function overlapTail(text, overlap) {
  if (overlap <= 0 || text.length <= overlap) return '';
  const tail = text.slice(-overlap);
  const sentenceStart = tail.search(/(?<=[.!?…\n])\s+/);
  return sentenceStart >= 0 ? tail.slice(sentenceStart).trim() : tail;
}

// ---- Similarity ----
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : -1;
}

// BM25-lite keyword score: term-frequency with saturation + short-doc bias
function keywordScore(queryKeywords, chunkText) {
  if (queryKeywords.length === 0) return 0;
  const textLower = chunkText.toLowerCase();
  const words = textLower.split(/\s+/);
  const lengthNorm = 1 / (1 + words.length / 300);
  let score = 0;
  for (const kw of queryKeywords) {
    let tf = 0;
    let idx = textLower.indexOf(kw);
    while (idx !== -1 && tf < 10) {
      tf++;
      idx = textLower.indexOf(kw, idx + kw.length);
    }
    if (tf > 0) score += (tf / (tf + 1.2)) * (1 + lengthNorm);
  }
  return score / queryKeywords.length;
}

// ---- Engine ----
export class RagEngine {
  constructor(kbStore) {
    this.kbStore = kbStore;
    this.apiBase = 'http://localhost:11434';
    this.headers = { 'Content-Type': 'application/json' };
    this.embeddingModel = '';
    this.enabled = true;
    this._embedFailedAt = 0; // timestamp of last embed failure, for fallback caching
    this._ingesting = false;
  }

  configure({ apiBase, headers, embeddingModel, enabled }) {
    if (apiBase) this.apiBase = apiBase;
    if (headers) this.headers = headers;
    if (embeddingModel !== undefined) this.embeddingModel = embeddingModel;
    if (enabled !== undefined) this.enabled = enabled;
    this._embedFailedAt = 0; // settings changed — retry embeddings
  }

  get _embedRecentlyFailed() {
    return Date.now() - this._embedFailedAt < EMBED_FAIL_CACHE_MS;
  }

  // POST /api/embed in batches. Throws on failure (caller decides fallback).
  async embedTexts(texts) {
    if (!this.embeddingModel) throw new Error('Embedding modeli ayarlanmamış');
    const results = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const res = await fetch(`${this.apiBase}/api/embed`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ model: this.embeddingModel, input: batch })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Embed hatası (${res.status}): ${body.substring(0, 200)}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.embeddings)) throw new Error('Embed yanıtı geçersiz');
      for (const emb of data.embeddings) results.push(new Float32Array(emb));
    }
    return results;
  }

  // Embed a search query. Returns null when embeddings are unavailable → keyword fallback.
  async embedQuery(text) {
    if (!this.embeddingModel || this._embedRecentlyFailed) return null;
    try {
      const [embedding] = await this.embedTexts([text]);
      return embedding || null;
    } catch (err) {
      console.warn('[Agentia RAG] Query embed failed, keyword fallback:', err.message);
      this._embedFailedAt = Date.now();
      return null;
    }
  }

  // Chunk + store a document, then embed chunks (each persisted immediately for resumability).
  // onProgress({ done, total }) is called per batch.
  async ingestDocument({ kbId, name, sourceType, sourceUrl = '', text, pageTexts = null }, onProgress = null) {
    const kb = await this.kbStore.getKb(kbId);
    if (!kb) throw new Error(`KB bulunamadı: ${kbId}`);

    // PDF pages carry their page number in chunk meta
    let chunks = [];
    if (pageTexts && pageTexts.length > 0) {
      for (const { page, text: pageText } of pageTexts) {
        chunks.push(...chunkText(pageText, { meta: { page } }));
        if (chunks.length >= MAX_CHUNKS_PER_DOC) break;
      }
    } else {
      chunks = chunkText(text || '');
    }
    if (chunks.length > MAX_CHUNKS_PER_DOC) chunks = chunks.slice(0, MAX_CHUNKS_PER_DOC);
    if (chunks.length === 0) throw new Error('Doküman boş — içerik çıkarılamadı');

    const charCount = chunks.reduce((sum, c) => sum + c.text.length, 0);
    const doc = await this.kbStore.addDoc({
      kbId, name, sourceType, sourceUrl, charCount,
      chunkCount: chunks.length,
      embedStatus: this.embeddingModel ? 'pending' : 'none',
      embeddingModel: this.embeddingModel
    });

    const records = chunks.map((c, i) => ({
      id: `${doc.id}_c${i}`,
      kbId, docId: doc.id, seq: i,
      text: c.text,
      embedding: null, model: null, dim: 0,
      meta: c.meta || {}
    }));
    await this.kbStore.putChunks(records);
    await this.kbStore.updateKb(kbId, {}); // bump updatedAt

    if (this.embeddingModel) {
      await this._embedDocChunks(doc.id, records, onProgress);
    }
    return this.kbStore.getDoc(doc.id);
  }

  // Embed pending chunks of a document, persisting per batch. Updates doc embedStatus.
  async _embedDocChunks(docId, chunkRecords, onProgress = null) {
    const pending = chunkRecords.filter(c => !c.embedding);
    const total = chunkRecords.length;
    let done = total - pending.length;
    let failed = false;

    for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
      const batch = pending.slice(i, i + EMBED_BATCH_SIZE);
      try {
        const embeddings = await this.embedTexts(batch.map(c => c.text));
        for (let j = 0; j < batch.length; j++) {
          await this.kbStore.updateChunkEmbedding(batch[j].id, embeddings[j], this.embeddingModel);
        }
        done += batch.length;
        await this.kbStore.updateDoc(docId, { embedStatus: done >= total ? 'done' : 'partial' });
        if (onProgress) onProgress({ docId, done, total });
      } catch (err) {
        console.warn('[Agentia RAG] Embed batch failed:', err.message);
        this._embedFailedAt = Date.now();
        failed = true;
        break;
      }
    }

    const status = done >= total ? 'done' : (done > 0 ? 'partial' : (failed ? 'failed' : 'partial'));
    await this.kbStore.updateDoc(docId, { embedStatus: status });
    return status;
  }

  // Resume interrupted embeddings after service worker restart
  async resumePendingEmbeddings(onProgress = null) {
    if (!this.embeddingModel || this._ingesting) return 0;
    const pendingDocs = await this.kbStore.getAllPendingDocs();
    let resumed = 0;
    for (const doc of pendingDocs) {
      const chunks = await this.kbStore.getChunksByDoc(doc.id);
      if (chunks.length === 0) continue;
      const status = await this._embedDocChunks(doc.id, chunks, onProgress);
      if (status === 'done') resumed++;
      if (this._embedRecentlyFailed) break; // Ollama unreachable — stop hammering
    }
    return resumed;
  }

  // Re-embed all chunks of a KB with the current model (after model change or failure)
  async reindexKb(kbId, onProgress = null) {
    const docs = await this.kbStore.listDocs(kbId);
    for (const doc of docs) {
      const chunks = await this.kbStore.getChunksByDoc(doc.id);
      // Clear stale embeddings from other models so _embedDocChunks re-embeds them
      const stale = chunks.filter(c => c.embedding && c.model !== this.embeddingModel);
      for (const c of stale) {
        c.embedding = null;
        await this.kbStore.updateChunkEmbedding(c.id, null, null);
      }
      await this.kbStore.updateDoc(doc.id, { embedStatus: 'pending', embeddingModel: this.embeddingModel });
      await this._embedDocChunks(doc.id, chunks, onProgress);
      if (this._embedRecentlyFailed) break;
    }
  }

  // Hybrid search over the given KBs (null/empty kbIds = all KBs).
  // Cosine for chunks embedded with the current model; keyword scoring otherwise.
  async search(query, kbIds = null, { topK = 5 } = {}) {
    let ids = kbIds;
    if (!ids || ids.length === 0) {
      const kbs = await this.kbStore.listKbs();
      ids = kbs.map(kb => kb.id);
    }
    if (ids.length === 0) return [];

    const chunks = await this.kbStore.getChunksByKbIds(ids);
    if (chunks.length === 0) return [];

    const queryEmbedding = await this.embedQuery(query);
    const queryKeywords = extractKeywords(query);

    const scored = [];
    for (const chunk of chunks) {
      let score, method;
      if (queryEmbedding && chunk.embedding && chunk.model === this.embeddingModel &&
          chunk.dim === queryEmbedding.length) {
        score = cosine(queryEmbedding, chunk.embedding);
        method = 'vector';
      } else {
        score = keywordScore(queryKeywords, chunk.text);
        method = 'keyword';
      }
      if (score > 0) scored.push({ chunk, score, method });
    }

    // Vector scores (0..1 cosine) and keyword scores live on comparable scales;
    // sort within method first (vector preferred), then by score
    scored.sort((a, b) => {
      if (a.method !== b.method) return a.method === 'vector' ? -1 : 1;
      return b.score - a.score;
    });
    const top = scored.slice(0, topK);

    // Attach doc/kb names for source attribution
    const docCache = new Map();
    const kbCache = new Map();
    const results = [];
    for (const { chunk, score, method } of top) {
      if (!docCache.has(chunk.docId)) docCache.set(chunk.docId, await this.kbStore.getDoc(chunk.docId));
      if (!kbCache.has(chunk.kbId)) kbCache.set(chunk.kbId, await this.kbStore.getKb(chunk.kbId));
      results.push({
        text: chunk.text,
        score: Math.round(score * 1000) / 1000,
        method,
        docName: docCache.get(chunk.docId)?.name || '?',
        kbName: kbCache.get(chunk.kbId)?.name || '?',
        page: chunk.meta?.page
      });
    }
    return results;
  }

  // Build an attributed context string for system-prompt injection, within a char budget
  async buildContext(query, kbIds, budgetChars = 4000, topK = 5) {
    if (!this.enabled || !kbIds || kbIds.length === 0) return '';
    let results;
    try {
      results = await this.search(query, kbIds, { topK });
    } catch (err) {
      console.warn('[Agentia RAG] buildContext failed:', err.message);
      return '';
    }
    if (results.length === 0) return '';

    const parts = [];
    let used = 0;
    for (const r of results) {
      const header = `[Kaynak: ${r.kbName} / ${r.docName}${r.page ? ` (sayfa ${r.page})` : ''}]`;
      const body = r.text.length > 800 ? r.text.substring(0, 800) + '…' : r.text;
      const section = `${header}\n${body}`;
      if (used + section.length > budgetChars) break;
      parts.push(section);
      used += section.length;
    }
    return parts.join('\n\n');
  }
}
