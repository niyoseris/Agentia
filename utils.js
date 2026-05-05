// Shared utilities for Agentia background handlers

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id || null;
}

export function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      // SPA pages (React, etc.) fire 'complete' before the app renders — extra settle time
      setTimeout(resolve, 1500);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        done();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, 10000);
  });
}