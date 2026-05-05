// Agentia Background Service Worker
// Message routing, initialization, and agent orchestration

import { AgentCore } from './agent-core.js';
import { ActionStore } from './action-store.js';
import { MemoryStore } from './memory-store.js';
import { handleTabAction } from './tab-handler.js';
import { handleDomAction } from './dom-handler.js';
import { handleWebSearch } from './search-handler.js';
import { handlePdfRead } from './pdf-handler.js';
import { handleImageSave } from './image-handler.js';
import { startRecording, stopRecording, getActiveRecording, setActiveRecording, replayRecording } from './recording-handler.js';
import { getSettings, saveSettings } from './settings-handler.js';
import { getTaskHistory, saveTaskHistory, deleteTaskHistory } from './ollama-handler.js';
import { getActiveTabId } from './utils.js';

const OLLAMA_BASE = 'http://localhost:11434';
let agentCore = null;
let actionStore = null;
let memoryStore = null;
let initPromise = null;
let currentTaskController = null;
let activeTaskId = null;

// ── MV3 Service Worker Keepalive ──────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'agentia-keepalive') {
    console.log('[Agentia] keepalive ping, task running:', !!currentTaskController);
  }
});

function startKeepalive() {
  chrome.alarms.create('agentia-keepalive', { periodInMinutes: 0.4 });
}

function stopKeepalive() {
  chrome.alarms.clear('agentia-keepalive');
}

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

  const saved = await getSettings();
  agentCore.updateSettings(saved);

  actionStore = new ActionStore();
  await actionStore.load();

  memoryStore = new MemoryStore();
  await memoryStore.load();
  agentCore.memoryStore = memoryStore;

  // Restore active recording state after service worker restart
  const sessionData = await chrome.storage.session.get('agentia_active_recording');
  if (sessionData.agentia_active_recording) {
    setActiveRecording(sessionData.agentia_active_recording);
    actionStore.setActiveRecording(sessionData.agentia_active_recording);
    console.log('[Agentia] Restored active recording:', sessionData.agentia_active_recording?.id);
  }

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
    if (getActiveRecording()) {
      await stopRecording(tab.id, actionStore);
    } else {
      await startRecording(tab.id, null, actionStore);
    }
  } else if (info.menuItemId === 'agentia-panel') {
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (info.menuItemId === 'agentia-ask') {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Message handler — central communication hub
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  const { type, payload = {} } = message;

  if (initPromise && (!agentCore || !actionStore)) {
    try {
      await Promise.race([
        initPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Init timeout')), 8000))
      ]);
    } catch {}
  }

  if (!agentCore || !actionStore) {
    sendResponse({ success: false, error: 'Extension initializing, please retry' });
    return;
  }

  try {
    switch (type) {
      case 'AGENT_CHAT': {
        const result = await agentCore.chat(payload.messages, payload.tabId);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'AGENT_STREAM_CHAT': {
        await agentCore.streamChat(payload.messages, payload.tabId, (chunk) => {
          chrome.runtime.sendMessage({ type: 'STREAM_CHUNK', chunk }).catch((e) => { console.warn('[Agentia] Stream notification failed:', e.message); });
        });
        sendResponse({ success: true });
        break;
      }

      case 'AGENT_RUN_TASK': {
        if (currentTaskController) currentTaskController.abort();
        const taskId = `task_${Date.now()}`;
        activeTaskId = taskId;
        currentTaskController = new AbortController();
        const taskSignal = currentTaskController.signal;

        sendResponse({ success: true, data: { started: true } });
        startKeepalive();

        agentCore.runTask(payload.task, payload.tabId, payload.messages || null, taskSignal)
          .catch((err) => {
            if (activeTaskId === taskId) {
              chrome.runtime.sendMessage({
                type: 'AGENT_EVENT',
                data: { type: 'TASK_ERROR', error: err.message }
              }).catch((e) => { console.warn('[Agentia] Notification failed:', e.message); });
            }
          })
          .finally(() => {
            if (activeTaskId === taskId) {
              currentTaskController = null;
              activeTaskId = null;
              stopKeepalive();
            }
          });
        break;
      }

      case 'STOP_TASK': {
        if (currentTaskController) {
          currentTaskController.abort();
          currentTaskController = null;
        }
        sendResponse({ success: true });
        break;
      }

      case 'OLLAMA_MODELS': {
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

      case 'CHECK_RECORDING_STATUS': {
        const rec = getActiveRecording();
        sendResponse({ isRecording: !!rec, recordingId: rec?.id || null });
        break;
      }

      case 'RECORDING_START': {
        const recTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        await startRecording(recTabId, payload.name, actionStore);
        sendResponse({ success: true });
        break;
      }

      case 'RECORDING_STOP': {
        const stopTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        const recording = await stopRecording(stopTabId, actionStore);
        sendResponse({ success: true, data: recording });
        break;
      }

      case 'RECORDING_EVENT': {
        actionStore.addEvent(payload.event);
        sendResponse({ success: true });
        break;
      }

      case 'REPLAY_RECORDING': {
        const result = await replayRecording(payload.recordingId, payload.tabId, payload.adaptive, agentCore, actionStore);
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

      case 'FILE_CREATE': {
        const fileKey = `agentia_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await chrome.storage.local.set({
          [fileKey]: {
            name: payload.name,
            content: payload.content || '',
            type: payload.type || 'html',
            created: Date.now(),
            updated: Date.now()
          }
        });
        sendResponse({ success: true, data: { fileKey } });
        break;
      }

      case 'FILE_UPDATE': {
        if (!payload.fileKey || !payload.fileKey.startsWith('agentia_file_')) {
          sendResponse({ success: false, error: 'Invalid fileKey: must start with agentia_file_' });
          break;
        }
        const existing = await chrome.storage.local.get(payload.fileKey);
        if (!existing[payload.fileKey]) {
          sendResponse({ success: false, error: `File not found: ${payload.fileKey}` });
          break;
        }
        existing[payload.fileKey].content = payload.content;
        existing[payload.fileKey].updated = Date.now();
        await chrome.storage.local.set({ [payload.fileKey]: existing[payload.fileKey] });
        sendResponse({ success: true, data: { fileKey: payload.fileKey, updated: true } });
        break;
      }

      case 'FILE_OPEN': {
        if (!payload.fileKey || !payload.fileKey.startsWith('agentia_file_')) {
          sendResponse({ success: false, error: 'Invalid fileKey: must start with agentia_file_' });
          break;
        }
        const checkData = await chrome.storage.local.get(payload.fileKey);
        if (!checkData[payload.fileKey]) {
          sendResponse({ success: false, error: `File not found: ${payload.fileKey}` });
          break;
        }
        const openUrl = chrome.runtime.getURL(`viewer.html?key=${payload.fileKey}`);
        // Retry tab creation — Chrome throws "Tabs cannot be edited right now"
        // when the user is dragging a tab or the browser is busy
        let openedTab = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            openedTab = await chrome.tabs.create({ url: openUrl, active: true });
            break;
          } catch (tabErr) {
            if (attempt < 2 && /cannot be edited/i.test(tabErr.message)) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            } else {
              throw tabErr;
            }
          }
        }
        sendResponse({ success: true, data: { url: openUrl, tabId: openedTab.id } });
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

      case 'GET_PAGE_INFO': {
        const tabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        if (!tabId) throw new Error('No active tab');
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab && tab.url && tab.url.match(/\.pdf($|\?)/i)) {
          sendResponse({
            success: true,
            data: {
              url: tab.url,
              title: tab.title || '',
              isPdf: true,
              hint: 'This is a PDF file. Use the pdf_read tool to extract text content.'
            }
          });
          break;
        }
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const body = document.body;
            const snippet = [];
            for (const h of body.querySelectorAll('h1,h2,h3')) {
              snippet.push(`<${h.tagName.toLowerCase()}>${h.textContent.trim().substring(0, 120)}</${h.tagName.toLowerCase()}>`);
            }
            const links = body.querySelectorAll('a[href]');
            for (let i = 0; i < Math.min(links.length, 30); i++) {
              const a = links[i];
              snippet.push(`<a href="${a.href}">${a.textContent.trim().substring(0, 80)}</a>`);
            }
            for (const el of body.querySelectorAll('form,input,select,textarea')) {
              const tag = el.tagName.toLowerCase();
              const name = el.name || el.id || '';
              const type = el.type || '';
              snippet.push(`<${tag} name="${name}" type="${type}">`);
            }
            const meta = document.querySelector('meta[name="description"]');
            if (meta) snippet.push(`<meta name="description" content="${meta.content?.substring(0, 200)}">`);
            return {
              url: location.href,
              title: document.title,
              html: snippet.join('\n').substring(0, 8000)
            };
          }
        });
        sendResponse({ success: true, data: result[0].result });
        break;
      }

      case 'PDF_READ': {
        const pdfResult = await handlePdfRead(payload, sender);
        sendResponse({ success: true, data: pdfResult });
        break;
      }

      case 'WEB_SEARCH': {
        const searchResult = await handleWebSearch(payload);
        sendResponse({ success: true, data: searchResult });
        break;
      }

      case 'IMAGE_SAVE': {
        const imageResult = await handleImageSave(payload.url);
        sendResponse({ success: true, data: imageResult });
        break;
      }

      case 'MEMORY_GET': {
        if (!memoryStore) await memoryStore?.load();
        const query = payload?.query || '';
        const allMemory = memoryStore?.getAll() || { preferences: {}, learned: [], taskMemory: [], chatMemory: [], recipes: [] };
        if (query) {
          const relevant = memoryStore?.buildMemoryPrompt(query) || '';
          sendResponse({ success: true, data: { memories: allMemory, relevantContext: relevant } });
        } else {
          sendResponse({ success: true, data: allMemory });
        }
        break;
      }

      case 'MEMORY_ADD_TASK': {
        await memoryStore?.addTaskMemory(payload.task, payload.summary, payload.success);
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_ADD_CHAT': {
        await memoryStore?.addChatMemory(payload.summary, payload.topics || []);
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_ADD_LEARNED': {
        await memoryStore?.addLearned(payload.topic, payload.info);
        sendResponse({ success: true, data: { topic: payload.topic, saved: true } });
        break;
      }

      case 'MEMORY_SAVE_PREFERENCE': {
        await memoryStore?.setPreference(payload.key, payload.value);
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_DELETE_LEARNED': {
        await memoryStore?.deleteLearned(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_DELETE_TASK': {
        await memoryStore?.deleteTaskMemory(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_CLEAR': {
        await memoryStore?.clear();
        sendResponse({ success: true });
        break;
      }

      case 'MEMORY_SAVE_RECIPE': {
        await memoryStore?.addRecipe(payload.site, payload.task, payload.steps);
        sendResponse({ success: true, data: { site: payload.site, task: payload.task } });
        break;
      }

      case 'MEMORY_GET_RECIPES': {
        const recipes = memoryStore?.data?.recipes || [];
        const matching = payload?.site ? recipes.filter(r => r.site.toLowerCase().includes(payload.site.toLowerCase())) : recipes;
        sendResponse({ success: true, data: matching });
        break;
      }

      case 'MEMORY_DELETE_RECIPE': {
        await memoryStore?.deleteRecipe(payload.id);
        sendResponse({ success: true });
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

// ---- Ollama API ----
async function getOllamaModels() {
  const res = await fetch(`${agentCore.localBase}/api/tags`);
  if (res.status === 403) {
    throw new Error('Ollama 403 Forbidden. Çözüm: OLLAMA_ORIGINS="*" ollama serve ile başlatın.');
  }
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
        chrome.runtime.sendMessage({ type: 'PULL_PROGRESS', data }).catch((e) => { console.warn('[Agentia] Pull progress notification failed:', e.message); });
      } catch {}
    }
  }
}

// ---- Side Panel ----
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => { console.warn('[Agentia] Side panel behavior setup failed:', e.message); });

// ---- Re-inject recording flag on tab navigation ----
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const rec = getActiveRecording();
  if (info.status === 'complete' && rec && rec.tabId === tabId) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => { window.__agentiaRecording = true; }
    }).catch(() => {});
    chrome.tabs.sendMessage(tabId, {
      type: 'START_RECORDING',
      recordingId: rec.id
    }).catch(() => {});
  }
});

// Start — keep the promise so message handler can await it
initPromise = init().catch(console.error);