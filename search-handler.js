// Web search handler — DuckDuckGo-based search

import { waitForTabLoad } from './utils.js';

export async function handleWebSearch(payload) {
  const { query, maxResults = 8 } = payload;
  if (!query) return { error: 'Search query is required' };

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
      args: [Math.min(maxResults, 15)]
    });

    return { query, results: results[0]?.result || [] };
  } finally {
    await chrome.tabs.remove(tab.id).catch((e) => { console.warn('[Agentia] Failed to close search tab:', e.message); });
  }
}