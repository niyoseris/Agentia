// Tab management handler

import { waitForTabLoad, getActiveTabId } from './utils.js';

export async function handleTabAction(payload) {
  const { action } = payload;

  switch (action) {
    case 'create': {
      const newTab = await chrome.tabs.create({ url: payload.url, active: payload.active ?? true });
      if (payload.url) {
        await waitForTabLoad(newTab.id);
        const loaded = await chrome.tabs.get(newTab.id).catch(() => newTab);
        return loaded;
      }
      return newTab;
    }

    case 'close':
      await chrome.tabs.remove(payload.tabId);
      return { closed: true };

    case 'activate':
      await chrome.tabs.update(payload.tabId, { active: true });
      return { activated: true };

    case 'navigate': {
      const navTabId = payload.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (!navTabId) throw new Error('No tab to navigate');
      await chrome.tabs.update(navTabId, { url: payload.url });
      await waitForTabLoad(navTabId);
      return { navigated: true, url: payload.url };
    }

    case 'get_all':
      return await chrome.tabs.query({});

    case 'get_active': {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
    }

    case 'screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 });
      return { dataUrl };
    }

    case 'reload':
      await chrome.tabs.reload(payload.tabId);
      return { reloaded: true };

    case 'go_back':
      await chrome.tabs.goBack(payload.tabId);
      return { done: true };

    case 'go_forward':
      await chrome.tabs.goForward(payload.tabId);
      return { done: true };

    default:
      throw new Error(`Unknown tab action: ${action}`);
  }
}