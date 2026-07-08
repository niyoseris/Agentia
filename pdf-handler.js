// PDF reading handler

import { getActiveTabId } from './utils.js';

// Static import — dynamic import() is not allowed in MV3 service workers
import './lib/pdf.min.mjs';
const _pdfjsLib = globalThis.pdfjsLib;

if (!_pdfjsLib) throw new Error('PDF.js yüklenemedi');
// Point worker to bundled script (in web_accessible_resources) — worker is required for text extraction
_pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.min.mjs');

function getPdfjsLib() {
  return _pdfjsLib;
}

export async function handlePdfRead(payload, sender) {
  const { url, pages, tabId } = payload;
  let pdfUrl = url;

  if (!pdfUrl) {
    const resolvedTabId = tabId || sender.tab?.id || await getActiveTabId();
    if (!resolvedTabId) throw new Error('PDF URL veya tab bulunamadı');
    const tab = await chrome.tabs.get(resolvedTabId);
    pdfUrl = tab.url;
  }

  if (!pdfUrl) throw new Error('PDF URL bulunamadı');

  const result = await extractPdfText({ url: pdfUrl, pages });
  return {
    title: decodeURIComponent(pdfUrl.split('/').pop().split('?')[0]),
    ...result
  };
}

// Extract text from a PDF given a URL or raw bytes (Uint8Array).
// pages: range string like "1-30" / "1,5,7" / "all-full" (every page, no 10-page cap)
export async function extractPdfText({ url, data, pages }) {
  let bytes = data;
  if (!bytes) {
    if (!url) throw new Error('PDF URL veya veri gerekli');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF indirilemedi (${response.status}): ${url}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !url.match(/\.pdf($|\?)/i)) {
      throw new Error('Bu URL bir PDF değil. Yalnızca PDF dosyaları okunabilir.');
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  }

  const pdfjsLib = await getPdfjsLib();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  const pageRange = pages === 'all-full'
    ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
    : parsePageRange(pages, pdf.numPages);

  const extractedPages = [];
  for (const pageNum of pageRange) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str).join(' ').trim();
    if (text) {
      extractedPages.push({ page: pageNum, text });
    }
  }

  return {
    totalPages: pdf.numPages,
    pages: extractedPages,
    charCount: extractedPages.reduce((sum, p) => sum + p.text.length, 0)
  };
}

function parsePageRange(range, totalPages) {
  if (!range || range === 'all') {
    const limit = Math.min(totalPages, 10);
    return Array.from({ length: limit }, (_, i) => i + 1);
  }
  const pages = new Set();
  for (const part of range.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      for (let i = Math.max(1, start); i <= Math.min(end, totalPages); i++) pages.add(i);
    } else {
      const n = parseInt(trimmed);
      if (n >= 1 && n <= totalPages) pages.add(n);
    }
  }
  return [...pages].sort((a, b) => a - b);
}