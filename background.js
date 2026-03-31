// Agentia Background Service Worker
// Handles Ollama communication, tab management, and agent orchestration

import { AgentCore } from './agent-core.js';
import { ActionStore } from './action-store.js';

const OLLAMA_BASE = 'http://localhost:11434';
let agentCore = null;
let actionStore = null;

// Initialize on startup
async function init() {
  agentCore = new AgentCore(OLLAMA_BASE);

  // Patch AgentCore's _bgMsg to call handlers directly (we are the background)
  agentCore._bgMsg = async (type, payload) => {
    return new Promise((resolve, reject) => {
      handleMessage({ type, payload }, {}, (response) => {
        if (response?.success === false) reject(new Error(response.error || 'Error'));
        else resolve(response?.data);
      });
    });
  };

  // Apply saved settings immediately so cloud/apiKey are active from the start
  const saved = await getSettings();
  agentCore.updateSettings(saved);

  actionStore = new ActionStore();
  await actionStore.load();
  setupContextMenu();
  console.log('[Agentia] Background initialized, cloud:', saved.useCloud);
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'agentia-record',
      title: 'Agentia: Kaydı Başlat/Durdur',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'agentia-panel',
      title: 'Agentia: Panel Aç',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'agentia-ask',
      title: 'Agentia: Bu Elementi Seç',
      contexts: ['all']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'agentia-record') {
    toggleRecording(tab);
  } else if (info.menuItemId === 'agentia-panel') {
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (info.menuItemId === 'agentia-ask') {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Message handler - central communication hub
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async
});

async function handleMessage(message, sender, sendResponse) {
  const { type, payload = {} } = message;

  // Guard: drop messages that arrive before init() finishes
  if (!agentCore || !actionStore) {
    sendResponse({ success: false, error: 'Extension initializing, please retry' });
    return;
  }

  try {
    switch (type) {
      // Sent by content.js on every page load — just acknowledge
      case 'CONTENT_READY':
        sendResponse({ success: true });
        break;

      case 'AGENT_CHAT': {
        const result = await agentCore.chat(payload.messages, payload.tabId);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'AGENT_STREAM_CHAT': {
        // Stream responses back via port
        await agentCore.streamChat(payload.messages, payload.tabId, (chunk) => {
          chrome.runtime.sendMessage({ type: 'STREAM_CHUNK', chunk }).catch(() => {});
        });
        sendResponse({ success: true });
        break;
      }

      case 'AGENT_RUN_TASK': {
        const result = await agentCore.runTask(payload.task, payload.tabId, payload.messages || null);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'OLLAMA_MODELS': {
        // Cloud mode has no local model list — just ping to verify auth/connectivity
        if (agentCore.useCloud) {
          try {
            await pingOllamaCloud();
            sendResponse({ success: true, data: [] });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        } else {
          try {
            const models = await getOllamaModels();
            sendResponse({ success: true, data: models });
          } catch (err) {
            // Not fatal — Ollama may simply not be running yet
            sendResponse({ success: false, error: err.message });
          }
        }
        break;
      }

      case 'OLLAMA_PULL': {
        await pullOllamaModel(payload.model);
        sendResponse({ success: true });
        break;
      }

      case 'TAB_ACTION': {
        const result = await handleTabAction(payload);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'DOM_ACTION': {
        const domTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        if (!domTabId) throw new Error('No active tab for DOM action');
        const result = await handleDomAction(payload, domTabId);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'RECORDING_START': {
        const recTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        await startRecording(recTabId, payload.name);
        sendResponse({ success: true });
        break;
      }

      case 'RECORDING_STOP': {
        const stopTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        const recording = await stopRecording(stopTabId);
        sendResponse({ success: true, data: recording });
        break;
      }

      case 'RECORDING_EVENT': {
        actionStore.addEvent(payload.event);
        sendResponse({ success: true });
        break;
      }

      case 'REPLAY_RECORDING': {
        const result = await replayRecording(payload.recordingId, payload.tabId, payload.adaptive);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'GET_RECORDINGS': {
        const recordings = actionStore.getRecordings();
        sendResponse({ success: true, data: recordings });
        break;
      }

      case 'DELETE_RECORDING': {
        await actionStore.deleteRecording(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'SAVE_TASK_HISTORY': {
        await saveTaskHistory(payload);
        sendResponse({ success: true });
        break;
      }

      case 'GET_TASK_HISTORY': {
        const history = await getTaskHistory();
        sendResponse({ success: true, data: history });
        break;
      }

      case 'DELETE_TASK_HISTORY': {
        await deleteTaskHistory(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'CLEAR_TASK_HISTORY': {
        await chrome.storage.local.remove('agentia_task_history');
        sendResponse({ success: true });
        break;
      }

      case 'CREATE_FILE': {
        const fileKey = `agentia_file_${Date.now()}`;
        await chrome.storage.local.set({
          [fileKey]: {
            name: payload.name,
            content: payload.content,
            type: payload.type || 'text',
            created: Date.now()
          }
        });
        const viewerUrl = chrome.runtime.getURL(`viewer.html?key=${fileKey}`);
        const tab = await chrome.tabs.create({ url: viewerUrl, active: true });
        sendResponse({ success: true, data: { fileKey, url: viewerUrl, tabId: tab.id } });
        break;
      }

      case 'GET_SETTINGS': {
        const settings = await getSettings();
        sendResponse({ success: true, data: settings });
        break;
      }

      case 'SAVE_SETTINGS': {
        await saveSettings(payload);
        agentCore.updateSettings(payload);
        sendResponse({ success: true });
        break;
      }

      case 'INJECT_SCRIPT': {
        await chrome.scripting.executeScript({
          target: { tabId: payload.tabId },
          func: new Function(payload.code)
        });
        sendResponse({ success: true });
        break;
      }

      case 'GET_PAGE_INFO': {
        const tabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        if (!tabId) throw new Error('No active tab');
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            url: location.href,
            title: document.title,
            html: document.documentElement.outerHTML.substring(0, 8000)
          })
        });
        sendResponse({ success: true, data: result[0].result });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (err) {
    console.error('[Agentia] Error:', type, err);
    sendResponse({ success: false, error: err.message });
  }
}

// ---- Ollama ----
async function getOllamaModels() {
  const res = await fetch(`${agentCore.localBase}/api/tags`);
  if (!res.ok) throw new Error(`Ollama bağlantı hatası (${res.status})`);
  const data = await res.json();
  return data.models || [];
}

async function pingOllamaCloud() {
  const res = await fetch(`${agentCore.cloudBase}/api/tags`, {
    headers: agentCore._headers()
  });
  if (res.status === 401 || res.status === 403) throw new Error('API key geçersiz veya eksik');
  if (!res.ok) throw new Error(`Cloud bağlantı hatası (${res.status})`);
}

async function pullOllamaModel(model) {
  const res = await fetch(`${agentCore.apiBase}/api/pull`, {
    method: 'POST',
    headers: agentCore._headers(),
    body: JSON.stringify({ name: model, stream: true })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        chrome.runtime.sendMessage({ type: 'PULL_PROGRESS', data }).catch(() => {});
      } catch {}
    }
  }
}

// ---- Tab Management ----
async function handleTabAction(payload) {
  const { action } = payload;

  switch (action) {
    case 'create':
      return await chrome.tabs.create({ url: payload.url, active: payload.active ?? true });

    case 'close':
      await chrome.tabs.remove(payload.tabId);
      return { closed: true };

    case 'activate':
      await chrome.tabs.update(payload.tabId, { active: true });
      return { activated: true };

    case 'navigate':
      await chrome.tabs.update(payload.tabId, { url: payload.url });
      return { navigated: true };

    case 'get_all':
      return await chrome.tabs.query({});

    case 'get_active': {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
    }

    case 'screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
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

// ---- DOM Actions ----
async function handleDomAction(payload, tabId) {
  const { action } = payload;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: executeDomAction,
    args: [payload]
  });

  return results[0]?.result;
}

function executeDomAction(payload) {
  const { action, selector, value, x, y, key } = payload;

  function findElement(sel) {
    if (!sel) return null;
    // Try multiple strategies
    let el = document.querySelector(sel);
    if (!el) {
      // Try by text content
      const all = document.querySelectorAll('button, a, input, [role="button"]');
      for (const e of all) {
        if (e.textContent.trim().toLowerCase().includes(sel.toLowerCase())) {
          el = e; break;
        }
      }
    }
    return el;
  }

  switch (action) {
    case 'click': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.click();
      return { clicked: true, tag: el.tagName, text: el.textContent.trim().substring(0, 50) };
    }

    case 'type': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };

      const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';

      if (isContentEditable) {
        // Draft.js / React contenteditable (Twitter, Gmail compose, etc.)
        // Step 1: Focus and move cursor to end
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // cursor to end
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Step 2: Fire beforeinput (Draft.js listens to this)
        el.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: value,
          bubbles: true,
          cancelable: true
        }));

        // Step 3: Actually insert the text via execCommand (synchronous, triggers React)
        const inserted = document.execCommand('insertText', false, value);

        // Step 4: Fire input event for any remaining listeners
        el.dispatchEvent(new InputEvent('input', {
          inputType: 'insertText',
          data: value,
          bubbles: true
        }));

        return { typed: true, method: 'contenteditable', execCommand: inserted, text: value };
      } else {
        // Standard input/textarea: use React's native setter trick
        el.focus();
        const nativeProto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(nativeProto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: true, method: 'input', text: value };
      }
    }

    case 'clear': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.focus();
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      } else {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
          'value'
        )?.set;
        if (nativeInputValueSetter) nativeInputValueSetter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { cleared: true };
    }

    case 'scroll': {
      if (selector) {
        const el = findElement(selector);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: y || 300, left: x || 0, behavior: 'smooth' });
      }
      return { scrolled: true };
    }

    case 'hover': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return { hovered: true };
    }

    case 'select': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      if (el.tagName === 'SELECT') {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { selected: true };
    }

    case 'keypress': {
      const el = findElement(selector) || document.activeElement;
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      return { keypressed: key };
    }

    case 'get_text': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { text: el.textContent.trim() };
    }

    case 'get_value': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { value: el.value };
    }

    case 'get_attr': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { value: el.getAttribute(payload.attr) };
    }

    case 'screenshot_element': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      const rect = el.getBoundingClientRect();
      return { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } };
    }

    case 'exists': {
      const el = findElement(selector);
      return { exists: !!el };
    }

    case 'query_all': {
      const els = document.querySelectorAll(selector);
      return {
        count: els.length,
        elements: Array.from(els).slice(0, 20).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          text: el.textContent.trim().substring(0, 100),
          href: el.href,
          value: el.value
        }))
      };
    }

    case 'get_dom_summary': {
      const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
      return {
        url: location.href,
        title: document.title,
        interactive: Array.from(interactive).slice(0, 50).map(el => ({
          tag: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          text: el.textContent.trim().substring(0, 80),
          href: el.href,
          placeholder: el.placeholder,
          selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()
        }))
      };
    }

    case 'wait_for': {
      // Return a promise-like result - actual wait handled by content script
      const el = document.querySelector(selector);
      return { found: !!el };
    }

    case 'extract_data': {
      const result = {};
      if (payload.fields) {
        for (const [key, sel] of Object.entries(payload.fields)) {
          const el = document.querySelector(sel);
          result[key] = el ? el.textContent.trim() : null;
        }
      }
      return result;
    }

    default:
      return { error: `Unknown DOM action: ${action}` };
  }
}

// ---- Recording ----
let activeRecording = null;

async function startRecording(tabId, name) {
  const recordingId = `rec_${Date.now()}`;
  activeRecording = {
    id: recordingId,
    name: name || `Kayıt ${new Date().toLocaleString('tr-TR')}`,
    tabId,
    startUrl: '',
    events: [],
    startTime: Date.now()
  };

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) activeRecording.startUrl = tabs[0].url;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.__agentiaRecording = true;
    }
  });

  chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING', recordingId });
  actionStore.setActiveRecording(activeRecording);

  chrome.runtime.sendMessage({ type: 'RECORDING_STATUS', status: 'started', recordingId }).catch(() => {});
  return recordingId;
}

async function stopRecording(tabId) {
  if (!activeRecording) return null;

  chrome.tabs.sendMessage(tabId || activeRecording.tabId, { type: 'STOP_RECORDING' }).catch(() => {});

  const recording = { ...activeRecording };
  recording.endTime = Date.now();
  recording.duration = recording.endTime - recording.startTime;

  await actionStore.saveRecording(recording);
  activeRecording = null;

  chrome.runtime.sendMessage({ type: 'RECORDING_STATUS', status: 'stopped', recording }).catch(() => {});
  return recording;
}

function toggleRecording(tab) {
  if (activeRecording) {
    stopRecording(tab.id);
  } else {
    startRecording(tab.id, null);
  }
}

// ---- Replay ----
async function replayRecording(recordingId, tabId, adaptive = false) {
  const recording = actionStore.getRecording(recordingId);
  if (!recording) throw new Error('Kayıt bulunamadı');

  let targetTabId = tabId;
  if (!targetTabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = tabs[0]?.id;
  }

  if (adaptive) {
    return await agentCore.adaptiveReplay(recording, targetTabId);
  }

  const results = [];
  for (const event of recording.events) {
    try {
      const result = await executeRecordedEvent(event, targetTabId);
      results.push({ event, result, success: true });
      await sleep(event.delay || 500);
    } catch (err) {
      results.push({ event, error: err.message, success: false });
    }
  }

  return { results, success: results.every(r => r.success) };
}

async function executeRecordedEvent(event, tabId) {
  switch (event.type) {
    case 'navigate':
      await chrome.tabs.update(tabId, { url: event.url });
      await waitForTabLoad(tabId);
      return { navigated: event.url };

    case 'click':
    case 'type':
    case 'scroll':
    case 'select':
    case 'keypress':
      return await handleDomAction({ ...event, action: event.type }, tabId);

    case 'tab_create':
      return await handleTabAction({ action: 'create', url: event.url });

    case 'tab_close':
      return await handleTabAction({ action: 'close', tabId: event.tabId });

    default:
      return { skipped: event.type };
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 10000); // Fallback timeout
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id || null;
}

// ---- Settings ----
async function getSettings() {
  const data = await chrome.storage.local.get('agentia_settings');
  return data.agentia_settings || {
    ollamaUrl: 'http://localhost:11434',
    useCloud: true,
    apiKey: '',
    model: 'llama3.2',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
    autoRecord: false,
    replayDelay: 500,
    maxIterations: 60
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ agentia_settings: settings });
}

// ---- Task History ----
async function getTaskHistory() {
  const data = await chrome.storage.local.get('agentia_task_history');
  return data.agentia_task_history || [];
}

async function saveTaskHistory(entry) {
  const history = await getTaskHistory();
  // Prepend new entry, keep last 50
  history.unshift({
    id: `task_${Date.now()}`,
    task: entry.task,
    result: entry.result,
    log: entry.log || [],
    messages: entry.messages || [],
    createdAt: Date.now(),
    success: entry.success ?? true
  });
  if (history.length > 50) history.splice(50);
  await chrome.storage.local.set({ agentia_task_history: history });
}

async function deleteTaskHistory(id) {
  const history = await getTaskHistory();
  const filtered = history.filter(h => h.id !== id);
  await chrome.storage.local.set({ agentia_task_history: filtered });
}

// ---- Side Panel ----
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Start
init().catch(console.error);
