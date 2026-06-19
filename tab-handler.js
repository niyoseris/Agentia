// Tab management handler

import { waitForTabLoad, getActiveTabId } from './utils.js';

export async function handleTabAction(payload) {
  const { action } = payload;

  // Wrap every tab action so activeTab permission errors get a friendly message
  const _run = async () => {
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
        const navTabId = payload.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []))[0]?.id;
        if (!navTabId) return { error: 'No tab to navigate — extension may not have been invoked yet. Click the toolbar icon first.' };
        await chrome.tabs.update(navTabId, { url: payload.url });
        await waitForTabLoad(navTabId);
        return { navigated: true, url: payload.url };
      }

      case 'get_all': {
        try {
          return await chrome.tabs.query({});
        } catch {
          return [];
        }
      }

      case 'get_active': {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          return tabs[0] || null;
        } catch {
          return null;
        }
      }

      case 'get_tab': {
        try {
          if (!payload.tabId) return { error: 'No focused tab' };
          const tab = await chrome.tabs.get(payload.tabId);
          return tab || { error: `Tab ${payload.tabId} not found` };
        } catch {
          return { error: `Tab ${payload.tabId} not found` };
        }
      }

      case 'screenshot': {
        try {
          let dataUrl;
          if (payload.tabId) {
            // Capture a specific tab by activating it in its window first
            const targetTab = await chrome.tabs.get(payload.tabId).catch(() => null);
            if (!targetTab) return { error: `Tab ${payload.tabId} not found` };
            await chrome.tabs.update(payload.tabId, { active: true });
            dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'jpeg', quality: 60 });
          } else {
            dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 });
          }
          return { dataUrl };
        } catch (err) {
          if (err.message?.includes('activeTab') || err.message?.includes('not been in invoked')) {
            return { error: 'Cannot screenshot — extension has not been invoked. Click the toolbar icon, then open the side panel.' };
          }
          throw err;
        }
      }

      case 'reload': {
        try {
          await chrome.tabs.reload(payload.tabId);
          return { reloaded: true };
        } catch (err) {
          return { error: `Cannot reload tab ${payload.tabId}: ${err.message}` };
        }
      }

      case 'go_back':
        await chrome.tabs.goBack(payload.tabId);
        return { done: true };

      case 'go_forward':
        await chrome.tabs.goForward(payload.tabId);
        return { done: true };

      default:
        throw new Error(`Unknown tab action: ${action}`);
    }
  };

  try {
    return await _run();
  } catch (err) {
    const msg = err.message || '';
    // Convert permission / invocation errors into friendly responses
    if (msg.includes('activeTab') || msg.includes('not been in invoked') || msg.includes('cannot be edited')) {
      return { error: `Extension hasn't been invoked — click the Agentia toolbar icon once, then try again.` };
    }
    throw err;
  }
}
