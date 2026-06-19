// Web search handler — Ollama web search primary, DuckDuckGo fallback

import { waitForTabLoad } from './utils.js';

const OLLAMA_WEB_SEARCH_URL = 'https://ollama.com/api/web_search';
const MAX_OLLAMA_RESULTS = 10;
const MAX_DDG_RESULTS = 15;

async function searchOllamaWebSearch(query, apiKey, maxResults, baseUrl) {
  if (!apiKey) throw new Error('Ollama API key missing');

  const url = baseUrl ? `${baseUrl}/api/web_search` : OLLAMA_WEB_SEARCH_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(Math.max(1, maxResults || 5), MAX_OLLAMA_RESULTS)
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama web search error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const results = (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || ''
  }));

  return results;
}

async function searchDuckDuckGo(query, maxResults) {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://duckduckgo.com/?q=${encodedQuery}&ia=web`;

  const tab = await chrome.tabs.create({ url: searchUrl, active: false });
  try {
    await waitForTabLoad(tab.id);
    await new Promise(r => setTimeout(r, 1500));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (max) => {
        const items = [];
        const articles = document.querySelectorAll('article[data-testid="result"]');
        for (const article of articles) {
          if (items.length >= max) break;
          const titleEl = article.querySelector('[data-testid="result-title-a"]');
          const snippetEl = article.querySelector('[data-testid="result-snippet"]');
          if (titleEl) {
            items.push({
              title: titleEl.textContent.trim(),
              url: titleEl.href || '',
              snippet: snippetEl ? snippetEl.textContent.trim() : ''
            });
          }
        }
        if (items.length === 0) {
          const links = document.querySelectorAll('.result__a');
          const snippets = document.querySelectorAll('.result__snippet');
          for (let i = 0; i < links.length && items.length < max; i++) {
            items.push({
              title: links[i].textContent.trim(),
              url: links[i].href || '',
              snippet: snippets[i] ? snippets[i].textContent.trim() : ''
            });
          }
        }
        return items;
      },
      args: [Math.min(maxResults, MAX_DDG_RESULTS)]
    });

    return results[0]?.result || [];
  } finally {
    await chrome.tabs.remove(tab.id).catch((e) => { console.warn('[Agentia] Failed to close search tab:', e.message); });
  }
}

export async function handleWebSearch(payload) {
  const { query, maxResults = 8, apiKey, cloudBase } = payload;
  if (!query) return { error: 'Search query is required' };

  // Try Ollama web search first when an API key is available
  if (apiKey) {
    try {
      const ollamaResults = await searchOllamaWebSearch(query, apiKey, maxResults, cloudBase);
      if (ollamaResults.length > 0) {
        return { query, engine: 'ollama', results: ollamaResults };
      }
      console.warn('[Agentia] Ollama web search returned no results, falling back to DuckDuckGo');
    } catch (err) {
      console.warn('[Agentia] Ollama web search failed, falling back to DuckDuckGo:', err.message);
    }
  }

  // Fallback to DuckDuckGo tab-based search
  const ddgResults = await searchDuckDuckGo(query, maxResults);
  return { query, engine: 'duckduckgo', results: ddgResults };
}
