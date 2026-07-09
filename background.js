// Agentia Background Service Worker
// Message routing, initialization, and agent orchestration

import { AgentCore } from './agent-core.js';
import { ActionStore } from './action-store.js';
import { MemoryStore } from './memory-store.js';
import { handleTabAction } from './tab-handler.js';
import { handleDomAction } from './dom-handler.js';
import { handleWebSearch } from './search-handler.js';
import { handleHttpRequest } from './http-handler.js';
import { handlePdfRead, extractPdfText } from './pdf-handler.js';
import { handleImageSave } from './image-handler.js';
import { startRecording, stopRecording, getActiveRecording, setActiveRecording, replayRecording, replayEvents } from './recording-handler.js';
import { getSettings, saveSettings } from './settings-handler.js';
import { getTaskHistory, saveTaskHistory, deleteTaskHistory } from './ollama-handler.js';
import { getActiveTabId } from './utils.js';
import { fileStore } from './file-store.js';
import { kbStore } from './kb-store.js';
import { RagEngine } from './rag.js';
import { personaStore } from './persona-store.js';
import { skillStore } from './skill-store.js';
import { seedBuiltins } from './builtins.js';

const OLLAMA_BASE = 'http://localhost:11434';
let agentCore = null;
let actionStore = null;
let memoryStore = null;
let ragEngine = null;
let fileStoreReady = null;
let initPromise = null;
let currentTaskController = null;
let activeTaskId = null;

// ── MV3 Service Worker Keepalive ──────────────────────────────────────────────
// Refcounted: tasks and KB ingestion can overlap; the alarm is cleared only
// when the last consumer stops.
let keepaliveRefs = 0;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'agentia-keepalive') {
    console.log('[Agentia] keepalive ping, refs:', keepaliveRefs, 'task running:', !!currentTaskController);
  }
});

function startKeepalive() {
  keepaliveRefs++;
  chrome.alarms.create('agentia-keepalive', { periodInMinutes: 0.4 });
}

function stopKeepalive() {
  keepaliveRefs = Math.max(0, keepaliveRefs - 1);
  if (keepaliveRefs === 0) chrome.alarms.clear('agentia-keepalive');
}

// ── Offscreen lifeline: keeps the SW alive during long tasks ──────────────────
let offscreenCreating = null;

async function ensureOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument?.()) return;
    // Older Chrome: fall back to getContexts check
    if (!chrome.offscreen.hasDocument) {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctxs.length > 0) return;
    }
    if (offscreenCreating) { await offscreenCreating; return; }
    offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Uzun süren ajan görevleri sırasında service worker\'ı canlı tutmak için.'
    });
    await offscreenCreating;
    offscreenCreating = null;
  } catch (e) {
    offscreenCreating = null;
    // Already-exists races are benign
    if (!/single offscreen/i.test(e.message)) console.warn('[Agentia] ensureOffscreen failed:', e.message);
  }
}

async function closeOffscreen() {
  try {
    const has = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : true;
    if (has) await chrome.offscreen.closeDocument();
  } catch (e) {
    console.warn('[Agentia] closeOffscreen failed:', e.message);
  }
}

// Accept the lifeline port so the offscreen doc keeps the SW's event loop warm
chrome.runtime.onConnect.addListener((p) => {
  if (p.name === 'agentia-lifeline') {
    p.onMessage.addListener(() => {}); // pings reset the SW idle timer
    p.onDisconnect.addListener(() => {});
  }
});

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

  // Personas + skills
  await personaStore.load();
  await personaStore.ensureDefault();
  await skillStore.load();
  // Ship built-in presets (Güvenlik Denetçisi persona + methodology skill) once
  await seedBuiltins(personaStore, skillStore);
  agentCore.personaStore = personaStore;
  agentCore.skillStore = skillStore;
  agentCore.setActivePersona(personaStore.getActive());

  // Open IndexedDB file store and migrate any files still in chrome.storage.local
  try {
    fileStoreReady = fileStore.open().then(async () => {
      const migrated = await fileStore.migrateFromChromeStorage();
      if (migrated > 0) console.log('[Agentia] Migrated', migrated, 'files from chrome.storage.local to IndexedDB');
    });
    await fileStoreReady;
  } catch (dbErr) {
    console.warn('[Agentia] IndexedDB file store init failed:', dbErr.message);
  }

  // Knowledge base store + RAG engine
  try {
    await kbStore.open();
    ragEngine = new RagEngine(kbStore);
    ragEngine.configure({
      apiBase: agentCore.apiBase,
      headers: agentCore._headers(),
      embeddingModel: saved.embeddingModel,
      enabled: saved.ragEnabled
    });
    agentCore.rag = ragEngine;
    // Resume any embeddings interrupted by a service worker restart
    startKeepalive();
    ragEngine.resumePendingEmbeddings((p) => broadcastKbEvent('EMBED_PROGRESS', p))
      .then((resumed) => {
        if (resumed > 0) console.log('[Agentia] Resumed embeddings for', resumed, 'documents');
      })
      .catch((e) => console.warn('[Agentia] Embedding resume failed:', e.message))
      .finally(() => stopKeepalive());
  } catch (kbErr) {
    console.warn('[Agentia] KB store init failed:', kbErr.message);
  }

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
        ensureOffscreen();

        agentCore.runTask(payload.task, payload.tabId, payload.messages || null, taskSignal)
          .catch((err) => {
            if (activeTaskId === taskId) {
              agentCore.markTaskError?.(err.message);
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
              closeOffscreen();
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

      case 'GET_ACTIVE_TASK': {
        // Let a reopened side panel resync a task that ran while it was closed
        const sess = await chrome.storage.session.get('agentia_active_task');
        sendResponse({ success: true, data: sess.agentia_active_task || null });
        break;
      }

      // ---- Local files (File System Access API lives in the panel) ----
      case 'LOCAL_FILE_LIST':
      case 'LOCAL_FILE_READ':
      case 'LOCAL_FILE_WRITE': {
        const op = type === 'LOCAL_FILE_LIST' ? 'list' : (type === 'LOCAL_FILE_READ' ? 'read' : 'write');
        const result = await requestFromPanel({ type: 'LOCAL_FILE_REQUEST', op, payload });
        sendResponse({ success: true, data: result });
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
        await fileStore.saveFile(fileKey, {
          name: payload.name,
          content: payload.content,
          type: payload.type || 'text',
          created: Date.now(),
          updated: Date.now()
        });
        const viewerUrl = chrome.runtime.getURL(`viewer.html?key=${fileKey}`);
        const tab = await chrome.tabs.create({ url: viewerUrl, active: true });
        sendResponse({ success: true, data: { fileKey, url: viewerUrl, tabId: tab.id } });
        break;
      }

      case 'FILE_CREATE': {
        const fileKey = `agentia_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await fileStore.saveFile(fileKey, {
          name: payload.name,
          content: payload.content || '',
          type: payload.type || 'html',
          created: Date.now(),
          updated: Date.now()
        });
        sendResponse({ success: true, data: { fileKey } });
        break;
      }

      case 'FILE_UPDATE': {
        if (!payload.fileKey || !payload.fileKey.startsWith('agentia_file_')) {
          sendResponse({ success: false, error: 'Invalid fileKey: must start with agentia_file_' });
          break;
        }
        const existing = await fileStore.getFile(payload.fileKey);
        if (!existing) {
          sendResponse({ success: false, error: `File not found: ${payload.fileKey}` });
          break;
        }
        await fileStore.saveFile(payload.fileKey, {
          name: existing.name,
          content: payload.content,
          type: existing.type,
          created: existing.created,
          updated: Date.now()
        });
        sendResponse({ success: true, data: { fileKey: payload.fileKey, updated: true } });
        break;
      }

      case 'FILE_OPEN': {
        if (!payload.fileKey || !payload.fileKey.startsWith('agentia_file_')) {
          sendResponse({ success: false, error: 'Invalid fileKey: must start with agentia_file_' });
          break;
        }
        const checkData = await fileStore.getFile(payload.fileKey);
        if (!checkData) {
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
        ragEngine?.configure({
          apiBase: agentCore.apiBase,
          headers: agentCore._headers(),
          embeddingModel: payload.embeddingModel,
          enabled: payload.ragEnabled
        });
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
        const searchResult = await handleWebSearch({
          ...payload,
          apiKey: payload.apiKey || agentCore.apiKey,
          cloudBase: payload.cloudBase || agentCore.cloudBase
        });
        sendResponse({ success: true, data: searchResult });
        break;
      }

      case 'HTTP_REQUEST': {
        const httpResult = await handleHttpRequest(payload);
        sendResponse({ success: true, data: httpResult });
        break;
      }

      case 'QUICK_REPORT': {
        // Generate a report from the research collected so far without stopping the task
        if (!currentTaskController) {
          sendResponse({ success: false, error: 'Aktif görev yok — hızlı rapor yalnızca görev çalışırken kullanılabilir' });
          break;
        }
        if (!agentCore.currentResearchBuffer || agentCore.currentResearchBuffer.length === 0) {
          sendResponse({ success: false, error: 'Henüz araştırma verisi toplanmadı' });
          break;
        }
        try {
          const html = await agentCore.buildQuickReportHtml();
          if (!html) throw new Error('HTML rapor oluşturulamadı');

          const fileKey = `agentia_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const reportName = `Hızlı Rapor - ${agentCore.currentTaskDescription.substring(0, 50)}`;
          await fileStore.saveFile(fileKey, {
            name: reportName,
            content: html,
            type: 'html',
            created: Date.now(),
            updated: Date.now()
          });

          const openUrl = chrome.runtime.getURL(`viewer.html?key=${fileKey}`);
          const openedTab = await chrome.tabs.create({ url: openUrl, active: true });

          chrome.runtime.sendMessage({
            type: 'AGENT_EVENT',
            data: { type: 'QUICK_REPORT_READY', fileKey, url: openUrl }
          }).catch((e) => { console.warn('[Agentia] Quick report event failed:', e.message); });

          sendResponse({ success: true, data: { fileKey, url: openUrl, tabId: openedTab.id } });
        } catch (err) {
          chrome.runtime.sendMessage({
            type: 'AGENT_EVENT',
            data: { type: 'QUICK_REPORT_ERROR', error: err.message }
          }).catch((e) => { console.warn('[Agentia] Quick report event failed:', e.message); });
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case 'IMAGE_SAVE': {
        const imageResult = await handleImageSave(payload.url);
        sendResponse({ success: true, data: imageResult });
        break;
      }

      case 'FILE_DOWNLOAD': {
        // Save a file to the user's Downloads via chrome.downloads (works without the panel)
        let downloadUrl = payload.url || payload.dataUrl;
        if (!downloadUrl && payload.content !== undefined) {
          const mime = payload.mimeType || 'text/plain';
          // Encode text as a UTF-8 base64 data URL (btoa can't handle multibyte directly)
          const b64 = btoa(unescape(encodeURIComponent(payload.content)));
          downloadUrl = `data:${mime};base64,${b64}`;
        }
        if (!downloadUrl) throw new Error('İndirme için content, dataUrl veya url gerekli');
        const filename = (payload.fileName || 'agentia-dosya.txt').replace(/[\\/:*?"<>|]/g, '_');
        const downloadId = await chrome.downloads.download({
          url: downloadUrl,
          filename,
          saveAs: !!payload.saveAs
        });
        sendResponse({ success: true, data: { downloadId, fileName: filename } });
        break;
      }

      case 'FILE_UPLOAD': {
        const uploadTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        if (!uploadTabId) throw new Error('No active tab for file upload');

        let fileContent = payload.content || '';
        let fileName = payload.fileName || 'file.txt';

        // If a URL is provided, fetch it from the background (avoids CORS)
        if (payload.url && !payload.content) {
          try {
            const fileRes = await fetch(payload.url);
            if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
            const blob = await fileRes.blob();
            // For binary files, convert to base64 and pass as text
            const buffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
            fileContent = btoa(binary);
            fileName = fileName || payload.url.split('/').pop() || 'file.bin';
            // Execute upload via DOM_ACTION with base64 content
            const uploadResult = await handleDomAction({
              action: 'set_file_input',
              selector: payload.selector,
              fileName: fileName,
              content: fileContent,
              mimeType: payload.mimeType,
              isBase64: true
            }, uploadTabId);
            // Decode the base64 size for the response
            sendResponse({ success: true, data: { ...uploadResult, size: Math.round(buffer.byteLength) } });
            break;
          } catch (fetchErr) {
            sendResponse({ success: false, error: `File fetch failed: ${fetchErr.message}` });
            break;
          }
        }

        // Direct content upload (text content provided by agent)
        const uploadResult = await handleDomAction({
          action: 'set_file_input',
          selector: payload.selector,
          fileName: fileName,
          content: fileContent,
          mimeType: payload.mimeType
        }, uploadTabId);
        sendResponse({ success: true, data: uploadResult });
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
        await memoryStore?.addLearned(payload.topic, payload.info, payload.category);
        sendResponse({ success: true, data: { topic: payload.topic, saved: true } });
        break;
      }

      case 'MEMORY_GET_CATEGORIES': {
        sendResponse({ success: true, data: memoryStore?.getLearnedCategories() || [] });
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

      // ---- Knowledge Bases ----
      case 'KB_LIST': {
        const kbs = await kbStore.listKbs();
        sendResponse({ success: true, data: kbs });
        break;
      }

      case 'KB_CREATE': {
        const kb = await kbStore.createKb({ name: payload.name, description: payload.description });
        sendResponse({ success: true, data: kb });
        break;
      }

      case 'KB_UPDATE': {
        const kb = await kbStore.updateKb(payload.id, { name: payload.name, description: payload.description });
        sendResponse({ success: true, data: kb });
        break;
      }

      case 'KB_DELETE': {
        await kbStore.deleteKb(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'KB_LIST_DOCS': {
        const docs = await kbStore.listDocs(payload.kbId);
        sendResponse({ success: true, data: docs });
        break;
      }

      case 'KB_LIST_ALL_DOCS': {
        // All documents across every KB (so the agent can find a doc by name)
        const kbs = await kbStore.listKbs();
        const all = [];
        for (const kb of kbs) {
          const docs = await kbStore.listDocs(kb.id);
          for (const d of docs) all.push({ id: d.id, name: d.name, kbId: kb.id, kbName: kb.name, chunkCount: d.chunkCount });
        }
        sendResponse({ success: true, data: all });
        break;
      }

      case 'KB_DELETE_DOC': {
        await kbStore.deleteDoc(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'KB_GET_DOC_TEXT': {
        const chunks = await kbStore.getChunksByDoc(payload.id);
        chunks.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        const text = chunks.map(c => c.text).join('\n\n');
        sendResponse({ success: true, data: { text } });
        break;
      }

      case 'KB_ADD_DOC': {
        // Respond immediately, ingest async (mirrors AGENT_RUN_TASK — avoids
        // the message-channel timeout on long embed runs)
        if (!ragEngine) throw new Error('RAG motoru hazır değil');
        sendResponse({ success: true, data: { started: true } });
        ingestDocAsync(payload, sender).catch((err) => {
          console.error('[Agentia] KB ingest error:', err);
          broadcastKbEvent('EMBED_ERROR', { kbId: payload.kbId, error: err.message });
        });
        break;
      }

      case 'KB_SEARCH': {
        if (!ragEngine) throw new Error('RAG motoru hazır değil');
        const results = await ragEngine.search(payload.query, payload.kbIds || null, { topK: payload.topK || 8 });
        sendResponse({ success: true, data: results });
        break;
      }

      case 'KB_REINDEX': {
        if (!ragEngine) throw new Error('RAG motoru hazır değil');
        sendResponse({ success: true, data: { started: true } });
        startKeepalive();
        ragEngine.reindexKb(payload.kbId, (p) => broadcastKbEvent('EMBED_PROGRESS', p))
          .then(() => broadcastKbEvent('REINDEX_DONE', { kbId: payload.kbId }))
          .catch((err) => broadcastKbEvent('EMBED_ERROR', { kbId: payload.kbId, error: err.message }))
          .finally(() => stopKeepalive());
        break;
      }

      // ---- Personas ----
      case 'PERSONA_LIST': {
        sendResponse({ success: true, data: { personas: personaStore.list(), activePersonaId: personaStore.data?.activePersonaId } });
        break;
      }

      case 'PERSONA_GET_ACTIVE': {
        sendResponse({ success: true, data: personaStore.getActive() });
        break;
      }

      case 'PERSONA_SAVE': {
        const persona = await personaStore.upsert(payload);
        // Keep the runtime copy fresh when the active persona was edited
        if (persona.id === personaStore.data?.activePersonaId) {
          agentCore.setActivePersona(persona);
        }
        sendResponse({ success: true, data: persona });
        break;
      }

      case 'PERSONA_DELETE': {
        await personaStore.delete(payload.id);
        agentCore.setActivePersona(personaStore.getActive());
        sendResponse({ success: true, data: { activePersonaId: personaStore.data?.activePersonaId } });
        break;
      }

      case 'PERSONA_SET_ACTIVE': {
        const persona = await personaStore.setActive(payload.id);
        agentCore.setActivePersona(persona);
        sendResponse({ success: true, data: persona });
        break;
      }

      // ---- Skills ----
      case 'SKILL_LIST': {
        sendResponse({ success: true, data: skillStore.list() });
        break;
      }

      case 'SKILL_GET': {
        const skill = payload.id ? skillStore.get(payload.id) : skillStore.getByName(payload.name);
        if (!skill) {
          const available = skillStore.list().map(s => s.name).join(', ') || '(hiç skill yok)';
          sendResponse({ success: false, error: `Skill bulunamadı: "${payload.name || payload.id}". Mevcut: ${available}` });
          break;
        }
        sendResponse({ success: true, data: skill });
        break;
      }

      case 'SKILL_SAVE': {
        const skill = await skillStore.upsert(payload);
        sendResponse({ success: true, data: skill });
        break;
      }

      case 'SKILL_DELETE': {
        await skillStore.delete(payload.id);
        sendResponse({ success: true });
        break;
      }

      case 'SKILL_SET_ENABLED': {
        const skill = await skillStore.setEnabled(payload.id, payload.enabled);
        sendResponse({ success: true, data: skill });
        break;
      }

      case 'SKILL_FROM_RECORDING': {
        const recording = actionStore.getRecording(payload.recordingId);
        if (!recording) throw new Error('Kayıt bulunamadı');
        const skill = await skillStore.fromRecording(recording, { name: payload.name, description: payload.description });
        sendResponse({ success: true, data: skill });
        break;
      }

      case 'SKILL_RUN_MACRO': {
        const skill = payload.id ? skillStore.get(payload.id) : skillStore.getByName(payload.name);
        if (!skill) throw new Error(`Skill bulunamadı: "${payload.name || payload.id}"`);
        if (skill.type !== 'macro' || !skill.steps?.length) {
          throw new Error(`"${skill.name}" bir makro skill değil — skill_use ile talimatlarını yükleyin`);
        }
        const macroTabId = payload.tabId || sender.tab?.id || await getActiveTabId();
        const events = skill.steps.map(s => ({
          type: s.action,
          selector: s.selector || undefined,
          value: s.value || undefined,
          url: s.action === 'navigate' ? s.value : undefined,
          key: s.action === 'keypress' ? s.value : undefined
        }));
        let macroResult;
        if (payload.adaptive) {
          macroResult = await agentCore.adaptiveReplay({ name: skill.name, events }, macroTabId);
        } else {
          macroResult = await replayEvents(events, macroTabId);
        }
        const resultList = macroResult.results || [];
        sendResponse({
          success: true,
          data: {
            succeeded: resultList.filter(r => r.success).length,
            failed: resultList.filter(r => !r.success).length,
            total: resultList.length
          }
        });
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

// Ask the side panel to perform a File System Access operation and await its
// reply. Rejects clearly if no panel is open (FS Access needs a window context).
function requestFromPanel(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error('Yerel dosya erişimi için Agentia panelinin açık olması gerekir.'));
      }
      if (!response) return reject(new Error('Panelden yanıt alınamadı (panel açık mı?).'));
      if (response.success === false) return reject(new Error(response.error || 'Yerel dosya işlemi başarısız'));
      resolve(response.data);
    });
  });
}

// ---- Knowledge Base ingestion ----
function broadcastKbEvent(eventType, data) {
  chrome.runtime.sendMessage({ type: 'KB_EVENT', data: { type: eventType, ...data } })
    .catch((e) => { console.warn('[Agentia] KB event notification failed:', e.message); });
}

// Ingest a document into a KB. payload:
// { kbId, name, sourceType: 'text'|'file'|'pdf'|'page', content?, contentBase64?, url?, tabId? }
async function ingestDocAsync(payload, sender) {
  const { kbId, sourceType } = payload;
  let name = payload.name || '';
  let text = payload.content || '';
  let pageTexts = null;
  let sourceUrl = payload.url || '';

  startKeepalive();
  try {
    if (sourceType === 'pdf') {
      let pdfResult;
      if (payload.contentBase64) {
        const binary = atob(payload.contentBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        pdfResult = await extractPdfText({ data: bytes, pages: 'all-full' });
      } else if (payload.url) {
        pdfResult = await extractPdfText({ url: payload.url, pages: 'all-full' });
      } else {
        throw new Error('PDF için url veya contentBase64 gerekli');
      }
      pageTexts = pdfResult.pages;
      if (!name) name = sourceUrl ? decodeURIComponent(sourceUrl.split('/').pop().split('?')[0]) : 'PDF dokümanı';
    } else if (sourceType === 'page') {
      const tabId = payload.tabId || sender.tab?.id || await getActiveTabId();
      if (!tabId) throw new Error('Sayfa kaydetmek için aktif tab bulunamadı');
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          url: location.href,
          title: document.title,
          text: document.body.innerText.substring(0, 1500000)
        })
      });
      const pageData = result[0].result;
      text = pageData.text;
      sourceUrl = pageData.url;
      if (!name) name = pageData.title || pageData.url;
    }
    // 'text' and 'file': content arrives directly in payload.content

    if (!text && !pageTexts) throw new Error('İçerik boş — doküman eklenemedi');

    const doc = await ragEngine.ingestDocument(
      { kbId, name: name || 'Adsız doküman', sourceType, sourceUrl, text, pageTexts },
      (p) => broadcastKbEvent('EMBED_PROGRESS', { kbId, ...p })
    );
    broadcastKbEvent('EMBED_DONE', { kbId, docId: doc.id, embedStatus: doc.embedStatus, chunkCount: doc.chunkCount });
  } finally {
    stopKeepalive();
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