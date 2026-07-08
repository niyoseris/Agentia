// Agentia Side Panel — Main UI Logic

import { addModelToHistory } from './settings-handler.js';
import { pickFiles, pickDirectory, listHandles, removeHandle, handleLocalFileRequest } from './local-files.js';

const bg = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res?.success === false) return reject(new Error(res.error || 'Unknown error'));
      resolve(res?.data);
    });
  });

// ---- State ----
let isRecording = false;
let isRunningTask = false;
let currentTabId = null;
let chatHistory = []; // { role, content }
let taskSessionMessages = null;  // Full message history of the current task session
let taskSessionName = '';        // Original task description of the session
const CHAT_STORAGE_KEY = 'agentia_chat_history';
const MAX_CHAT_MESSAGES = 100;

// Background message with auto-retry on "initializing" error
async function bgWithRetry(type, payload, maxRetries = 4, delayMs = 1500) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await bg(type, payload);
    } catch (err) {
      const isInit = err.message?.includes('initializing') || err.message?.includes('retry');
      if (isInit && attempt < maxRetries - 1) {
        taskLog('info', `⟳ Uzantı başlatılıyor… (${attempt + 1}/${maxRetries - 1})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupChat();
  setupTask();
  setupHistory();
  setupRecordings();
  setupSettings();
  setupStudio();
  setupKeyboardShortcuts();
  setupTheme();
  await loadSettings();
  await checkConnection();
  await refreshRecordings();
  await refreshHistory();
  await loadChatHistory();
  loadPersonaSwitcher();
  getCurrentTab();
  resyncActiveTask();
});

// Rehydrate a task that ran (or is still running) while the panel was closed
async function resyncActiveTask() {
  try {
    const active = await bgWithRetry('GET_ACTIVE_TASK', {});
    if (!active || !active.events || active.events.length === 0) return;
    // Only rehydrate an in-progress task; completed/stopped/errored ones live in history
    if (active.status !== 'running') return;
    switchTab('task');
    taskLog('info', '↻ Devam eden görev geri yüklendi (panel kapalıyken sürdü)');
    for (const evt of active.events) handleAgentEvent(evt);
    setTaskRunning(true); // reconnect to the live event stream
  } catch (err) {
    console.warn('[Agentia] Active task resync failed:', err.message);
  }
}

async function getCurrentTab() {
  try {
    const tab = await bg('TAB_ACTION', { action: 'get_active' });
    currentTabId = tab?.id || null;
  } catch {
    currentTabId = null;
  }
}

// ---- Background Event Listener ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data, chunk, status, recording, recordingId } = message;

  if (type === 'STREAM_CHUNK') handleStreamChunk(chunk);
  if (type === 'AGENT_EVENT') handleAgentEvent(data);
  if (type === 'RECORDING_STATUS') handleRecordingStatus(status, recording, recordingId);
  if (type === 'PULL_PROGRESS') handlePullProgress(data);
  if (type === 'KB_EVENT') handleKbEvent(data);

  // Service worker asks the panel to perform a File System Access operation
  if (type === 'LOCAL_FILE_REQUEST') {
    handleLocalFileRequest(message.op, message.payload || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep the channel open for the async response
  }
});

// ---- Tab Switching ----
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// Programmatically activate a tab by its data-tab name
function switchTab(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  const panel = document.getElementById(`tab-${name}`);
  if (!btn || !panel) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  panel.classList.add('active');
}

// ---- Connection / Settings ----
async function checkConnection() {
  const dot = document.getElementById('status-dot');
  try {
    await bg('OLLAMA_MODELS', {});
    dot.className = 'status-dot connected';
    dot.title = 'Ollama bağlı';
  } catch (err) {
    dot.className = 'status-dot error';
    dot.title = 'Bağlanamadı: ' + err.message;
    // Not a fatal error — user may not have Ollama running yet
  }
}

function updateModelBadge(model) {
  const badge = document.getElementById('model-badge');
  badge.textContent = model ? model.split(':')[0] : '—';
}

function populateModelHistory(history, currentModel) {
  const select = document.getElementById('model-history');
  if (!select) return;
  const items = Array.isArray(history) ? history : [];
  select.innerHTML = '<option value="">— Kayıtlı model seç —</option>' +
    items.map(m => `<option value="${escHtml(m)}"${m === currentModel ? ' selected' : ''}>${escHtml(m)}</option>`).join('');
}

async function loadSettings() {
  try {
    const s = await bg('GET_SETTINGS', {});
    if (s.ollamaUrl) document.getElementById('ollama-url').value = s.ollamaUrl;
    if (s.apiKey) document.getElementById('api-key').value = s.apiKey;
    if (s.useCloud) {
      document.getElementById('use-cloud').checked = true;
      toggleCloudMode(true);
    }
    if (s.model) document.getElementById('model-input').value = s.model;
    populateModelHistory(s.modelHistory || [], s.model);
    if (s.temperature !== undefined) {
      document.getElementById('temperature').value = s.temperature;
      document.getElementById('temperature-val').textContent = s.temperature;
    }
    if (s.maxTokens) document.getElementById('max-tokens').value = s.maxTokens;
    if (s.systemPrompt) document.getElementById('system-prompt').value = s.systemPrompt;
    if (s.replayDelay) document.getElementById('replay-delay').value = s.replayDelay;
    if (s.maxIterations !== undefined) document.getElementById('max-iterations').value = s.maxIterations;
    if (s.thinkingMode !== undefined) document.getElementById('thinking-mode').value = s.thinkingMode;
    if (s.visionEnabled !== undefined) document.getElementById('vision-enabled').value = s.visionEnabled;
    if (s.autoRecord) document.getElementById('auto-record').checked = s.autoRecord;
    if (s.embeddingModel !== undefined) document.getElementById('embedding-model').value = s.embeddingModel;
    document.getElementById('rag-enabled').checked = s.ragEnabled !== false;
    if (s.ragTopK !== undefined) document.getElementById('rag-topk').value = s.ragTopK;
    document.getElementById('active-security-testing').checked = !!s.activeSecurityTesting;
    if (s.securityAuthorizedTargets !== undefined) document.getElementById('security-authorized-targets').value = s.securityAuthorizedTargets;
    updateModelBadge(s.model);
  } catch {}
}

function toggleCloudMode(isCloud) {
  document.getElementById('local-settings').style.display = isCloud ? 'none' : 'block';
  document.getElementById('cloud-settings').style.display = isCloud ? 'block' : 'none';
}

function setupSettings() {
  const tempSlider = document.getElementById('temperature');
  tempSlider.addEventListener('input', () => {
    document.getElementById('temperature-val').textContent = tempSlider.value;
  });

  document.getElementById('model-input').addEventListener('input', (e) => {
    updateModelBadge(e.target.value);
  });

  document.getElementById('model-history').addEventListener('change', (e) => {
    const model = e.target.value;
    if (!model) return;
    document.getElementById('model-input').value = model;
    updateModelBadge(model);
  });

  document.getElementById('test-connection-btn').addEventListener('click', async () => {
    const isCloud = document.getElementById('use-cloud').checked;
    try {
      await bg('OLLAMA_MODELS', {});
      showConnectionResult('✓ Bağlandı', true);
      document.getElementById('status-dot').className = 'status-dot connected';
    } catch (err) {
      const raw = err.message;
      let hint = raw;
      if (raw.includes('Failed to fetch')) {
        hint = isCloud
          ? 'Sunucuya ulaşılamadı — internet bağlantını kontrol et'
          : 'Ollama çalışmıyor — terminalde: ollama serve';
      } else if (raw.includes('401') || raw.includes('API key')) {
        hint = 'API key geçersiz — ollama.com/settings/keys';
      } else if (raw.includes('404')) {
        hint = 'Endpoint bulunamadı — URL\'yi kontrol et';
      }
      showConnectionResult('✗ ' + hint, false);
      document.getElementById('status-dot').className = 'status-dot error';
    }
  });

  // Cloud toggle
  document.getElementById('use-cloud').addEventListener('change', (e) => {
    toggleCloudMode(e.target.checked);
  });

  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const currentModel = document.getElementById('model-input').value.trim();
    const base = {
      ollamaUrl: document.getElementById('ollama-url').value,
      apiKey: document.getElementById('api-key').value,
      useCloud: document.getElementById('use-cloud').checked,
      model: currentModel,
      temperature: parseFloat(document.getElementById('temperature').value),
      maxTokens: parseInt(document.getElementById('max-tokens').value),
      systemPrompt: document.getElementById('system-prompt').value,
      replayDelay: parseInt(document.getElementById('replay-delay').value),
      maxIterations: parseInt(document.getElementById('max-iterations').value),
      thinkingMode: document.getElementById('thinking-mode').value,
      visionEnabled: document.getElementById('vision-enabled').value,
      autoRecord: document.getElementById('auto-record').checked,
      embeddingModel: document.getElementById('embedding-model').value.trim(),
      ragEnabled: document.getElementById('rag-enabled').checked,
      ragTopK: parseInt(document.getElementById('rag-topk').value) || 5,
      activeSecurityTesting: document.getElementById('active-security-testing').checked,
      securityAuthorizedTargets: document.getElementById('security-authorized-targets').value.trim()
    };
    const settings = addModelToHistory(base, currentModel);
    try {
      await bg('SAVE_SETTINGS', settings);
      showConnectionResult('✓ Ayarlar kaydedildi', true);
      updateModelBadge(settings.model);
      populateModelHistory(settings.modelHistory, settings.model);
    } catch (err) {
      showConnectionResult('Hata: ' + err.message, false);
    }
  });

  document.getElementById('pull-model-btn').addEventListener('click', async () => {
    const model = document.getElementById('pull-model-input').value.trim();
    if (!model) return;
    document.getElementById('pull-progress').textContent = `İndiriliyor: ${model}...`;
    try {
      await bg('OLLAMA_PULL', { model });
    } catch (err) {
      document.getElementById('pull-progress').textContent = 'Hata: ' + err.message;
    }
  });
}

function showConnectionResult(msg, ok) {
  const el = document.getElementById('connection-result');
  el.textContent = msg;
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
}

function handlePullProgress(data) {
  const el = document.getElementById('pull-progress');
  if (data.status) {
    const pct = data.total ? Math.round((data.completed / data.total) * 100) : '';
    el.textContent = `${data.status}${pct ? ` — ${pct}%` : ''}`;
  }
  if (data.status === 'success') {
    el.textContent = '✓ İndirildi!';
    el.style.color = 'var(--green)';
    bg('OLLAMA_MODELS', {}).then(populateModels).catch((e) => { console.warn('[Agentia] Model list refresh failed:', e.message); });
  }
}

// ---- Chat ----
let streamBuffer = '';
let streamEl = null;

function setupChat() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('send-btn');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  btn.addEventListener('click', sendChat);

  setupClearChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  saveChatHistory();

  const typingEl = appendTyping();

  try {
    streamBuffer = '';
    streamEl = null;

    await bg('AGENT_STREAM_CHAT', {
      messages: chatHistory,
      tabId: currentTabId
    });

    // Stream chunks arrive via onMessage → handleStreamChunk
    // streamEl is finalized when done=true arrives
  } catch (err) {
    typingEl?.remove();
    appendMessage('assistant', '⚠ Hata: ' + err.message);
  } finally {
    document.getElementById('send-btn').disabled = false;
  }
}

function handleStreamChunk(chunk) {
  if (!chunk) return;

  const typingEl = document.querySelector('.typing-indicator');
  typingEl?.remove();

  if (!streamEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message assistant';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    wrapper.appendChild(bubble);
    document.getElementById('messages').appendChild(wrapper);
    streamEl = bubble;
    scrollMessages();
  }

  if (chunk.token) {
    streamBuffer += chunk.token;
    streamEl.textContent = streamBuffer;
    scrollMessages();
  }

  // Show thinking/reasoning content as a subtle thought bubble (only if thinking mode is enabled)
  const thinkingMode = document.getElementById('thinking-mode')?.value || 'off';
  if (chunk.thinking && thinkingMode !== 'off') {
    let thoughtEl = document.getElementById('stream-thought');
    if (!thoughtEl) {
      thoughtEl = document.createElement('div');
      thoughtEl.id = 'stream-thought';
      thoughtEl.style.cssText = 'font-size:12px;color:var(--text3);font-style:italic;padding:4px 12px;margin-bottom:4px;opacity:0.7;';
      streamEl.parentElement.insertBefore(thoughtEl, streamEl);
    }
    thoughtEl.textContent = '💭 ' + chunk.thinking.substring(0, 200) + (chunk.thinking.length > 200 ? '...' : '');
    scrollMessages();
  }

  if (chunk.done) {
    chatHistory.push({ role: 'assistant', content: streamBuffer });
    saveChatHistory();
    if (streamEl && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      streamEl.innerHTML = DOMPurify.sanitize(marked.parse(streamBuffer));
      streamEl.classList.add('markdown-body');
    }
    streamBuffer = '';
    streamEl = null;
    // Clear thinking bubble after stream ends
    document.getElementById('stream-thought')?.remove();
  }
}

function appendMessage(role, content) {
  const messages = document.getElementById('messages');
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'assistant' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
    bubble.classList.add('markdown-body');
  } else {
    bubble.textContent = content;
  }

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  messages.appendChild(wrapper);
  scrollMessages();
  return wrapper;
}

function appendTyping() {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="typing-indicator">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;
  messages.appendChild(div);
  scrollMessages();
  return div;
}

let _scrollTimer = null;
function scrollMessages() {
  // Debounce: coalesce rapid calls during streaming
  if (_scrollTimer) return;
  _scrollTimer = requestAnimationFrame(() => {
    const el = document.getElementById('messages');
    el.scrollTop = el.scrollHeight;
    _scrollTimer = null;
  });
}

// ---- Task (Autonomous Agent) ----
function setupTask() {
  document.getElementById('run-task-btn').addEventListener('click', runTask);
  document.getElementById('stop-task-btn').addEventListener('click', stopTask);
  document.getElementById('stop-task-btn-2').addEventListener('click', stopTask);
  document.getElementById('quick-report-btn').addEventListener('click', quickReport);
  document.getElementById('task-new-btn').addEventListener('click', resetTaskSession);

  const continueInput = document.getElementById('task-continue-input');
  continueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      continueTask();
    }
  });
  continueInput.addEventListener('input', () => {
    continueInput.style.height = 'auto';
    continueInput.style.height = Math.min(continueInput.scrollHeight, 100) + 'px';
  });
  document.getElementById('task-continue-btn').addEventListener('click', continueTask);
}

function setTaskRunning(running, label = '') {
  isRunningTask = running;
  const statusEl = document.getElementById('task-status');
  const status2El = document.getElementById('task-status-2');
  const stopBtn = document.getElementById('stop-task-btn');
  const stopBtn2 = document.getElementById('stop-task-btn-2');
  const continueArea = document.getElementById('task-continue-area');
  const runBtn = document.getElementById('run-task-btn');
  const quickReportBtn = document.getElementById('quick-report-btn');

  if (running) {
    // Running state
    stopBtn.style.display = 'inline-flex';
    stopBtn2.style.display = 'inline-flex';
    quickReportBtn.style.display = 'inline-flex';
    statusEl.textContent = label || 'Çalışıyor...';
    status2El.textContent = label || 'Çalışıyor...';
    continueArea.style.display = 'none';
    runBtn.style.display = 'none';
  } else {
    // Idle state
    stopBtn.style.display = 'none';
    stopBtn2.style.display = 'none';
    quickReportBtn.style.display = 'none';
    statusEl.textContent = '';
    status2El.textContent = '';
    runBtn.style.display = 'inline-flex';
  }
}

function enterTaskSession(taskText) {
  taskSessionName = taskText;
  // Switch UI to session mode
  document.getElementById('task-new-area').style.display = 'none';
  document.getElementById('task-session-header').style.display = 'block';
  document.getElementById('task-session-title').textContent = taskText;
}

function resetTaskSession() {
  taskSessionMessages = null;
  taskSessionName = '';
  document.getElementById('task-new-area').style.display = 'block';
  document.getElementById('task-session-header').style.display = 'none';
  document.getElementById('task-continue-area').style.display = 'none';
  document.getElementById('task-input').value = '';
  clearTaskLog();
}

function showContinueArea(success) {
  const area = document.getElementById('task-continue-area');
  const hint = document.getElementById('task-continue-hint');
  area.style.display = 'block';
  hint.textContent = success
    ? '✓ Görev tamamlandı. Devam talimatı verebilirsin:'
    : '⚠ Görev durdu. Farklı bir yol deneyebilirsin:';
  hint.style.color = success ? 'var(--green)' : 'var(--yellow)';
  document.getElementById('task-continue-input').value = '';
  document.getElementById('task-continue-input').style.height = 'auto';
}

async function runTask() {
  if (isRunningTask) return;
  const taskText = document.getElementById('task-input').value.trim();
  if (!taskText) return;

  // Refresh active tab — prevents stale tab ID errors
  await getCurrentTab();
  if (!currentTabId) {
    taskLog('error', '✗ Aktif sekme bulunamadı. Lütfen bir sayfa açın.');
    return;
  }

  taskSessionMessages = null; // fresh session
  enterTaskSession(taskText);
  setTaskRunning(true);
  clearTaskLog();
  taskLog('info', `Görev başlatıldı: ${taskText}`);

  try {
    // Fire-and-forget: background responds immediately with { started: true }
    // Task completion arrives via AGENT_EVENT (TASK_COMPLETE / TASK_STOPPED / TASK_ERROR)
    await bgWithRetry('AGENT_RUN_TASK', {
      task: taskText,
      tabId: currentTabId,
      messages: null
    });
  } catch (err) {
    taskLog('error', '✗ Başlatılamadı: ' + err.message);
    setTaskRunning(false);
  }
}

async function continueTask() {
  if (isRunningTask) return;
  const input = document.getElementById('task-continue-input');
  const text = input.value.trim();
  if (!text) return;

  // Do NOT refresh active tab on continuation — the agent tracks its own tabs.
  // If no session exists, require the user to start a new task.
  if (!taskSessionMessages || taskSessionMessages.length === 0) {
    taskLog('error', '✗ Devam edilecek bir görev oturumu yok. Lütfen yeni görev başlatın.');
    setTaskRunning(false);
    return;
  }

  input.value = '';
  input.style.height = 'auto';

  setTaskRunning(true, 'Devam ediyor...');
  document.getElementById('task-continue-area').style.display = 'none';

  // Add a visual divider in the log
  const log = document.getElementById('task-log');
  const divider = document.createElement('div');
  divider.className = 'log-divider';
  divider.textContent = `↩ Devam: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
  log.appendChild(divider);

  taskLog('info', `↩ Devam talimatı: ${text}`);

  try {
    // Fire-and-forget: result arrives via AGENT_EVENT
    // tabId is intentionally omitted so the agent continues from its own focused tab
    await bgWithRetry('AGENT_RUN_TASK', {
      task: text,
      messages: taskSessionMessages  // Pass full prior context
    });
  } catch (err) {
    taskLog('error', '✗ Başlatılamadı: ' + err.message);
    setTaskRunning(false);
  }
}

async function stopTask() {
  taskLog('info', '⏹ Durduruluyor...');
  try {
    await bg('STOP_TASK', {});
  } catch {}
  // UI update happens when TASK_STOPPED event arrives from agent-core
  // but also reset here as fallback
  setTaskRunning(false);
  showContinueArea(false);
}

async function quickReport() {
  if (!isRunningTask) {
    taskLog('info', '⚠ Hızlı rapor yalnızca aktif görev sırasında kullanılabilir');
    return;
  }
  taskLog('info', '📄 Hızlı rapor oluşturuluyor...');
  try {
    const result = await bgWithRetry('QUICK_REPORT', {});
    taskLog('result', `✓ Hızlı rapor açıldı: ${result?.url || result?.fileKey || ''}`, JSON.stringify(result, null, 2));
  } catch (err) {
    taskLog('error', '✗ Hızlı rapor hatası: ' + err.message, err.message);
  }
}

function handleAgentEvent(data) {
  if (!data) return;
  switch (data.type) {
    case 'TASK_START':
      taskLog('info', '▶ Görev başlatıldı');
      break;
    case 'AGENT_THOUGHT':
      // Show a summary of thought, expandable for full content
      if (data.content && !data.content.includes('<tool_call>')) {
        const summary = data.content.substring(0, 150);
        const fullThought = data.content;
        taskLog('thought', '💭 ' + summary + (data.content.length > 150 ? '...' : ''), fullThought);
      }
      break;
    case 'TOOL_CALL':
      taskLog('tool', `🔧 ${data.tool}(${JSON.stringify(data.args).substring(0, 120)})`, JSON.stringify(data.args));
      break;
    case 'TOOL_RESULT':
      taskLog('result', `✓ ${data.tool}: ${JSON.stringify(data.result).substring(0, 120)}`, JSON.stringify(data.result, null, 2));
      break;
    case 'TOOL_ERROR':
      taskLog('error', `✗ ${data.tool}: ${data.error}`, data.error);
      break;
    case 'TASK_COMPLETE':
      // Save messages for continuation, update UI
      if (data.messages) taskSessionMessages = data.messages;
      taskLog('final', '✓ Görev tamamlandı: ' + (data.result || '').substring(0, 200), data.result || '');
      setTaskRunning(false);
      showContinueArea(true);
      refreshHistory();
      break;
    case 'TASK_STOPPED':
      if (data.messages?.length > 0) taskSessionMessages = data.messages;
      taskLog('info', '⏹ Görev durduruldu');
      setTaskRunning(false);
      showContinueArea(false);
      refreshHistory();
      break;
    case 'TASK_ERROR':
      if (data.messages?.length > 0) taskSessionMessages = data.messages;
      taskLog('error', '✗ Görev hatası: ' + (data.error || 'Bilinmeyen hata'), data.error);
      setTaskRunning(false);
      showContinueArea(false);
      refreshHistory();
      break;
    case 'QUICK_REPORT_READY':
      taskLog('result', `✓ Hızlı rapor hazır: ${data.url || data.fileKey}`, JSON.stringify(data, null, 2));
      break;
    case 'QUICK_REPORT_ERROR':
      taskLog('error', '✗ Hızlı rapor oluşturulamadı: ' + (data.error || 'Bilinmeyen hata'), data.error);
      break;
    case 'ADAPTIVE_REPLAY_START':
      taskLog('info', `🔄 Adaptif tekrar başladı: ${data.recording}`);
      break;
    case 'ADAPTIVE_FALLBACK':
      taskLog('thought', `🔍 Element bulunamadı, AI alternatif arıyor: ${data.event?.selector}`);
      break;
    case 'ADAPTIVE_FAILED':
      taskLog('error', `✗ Adaptif tekrar başarısız: ${data.error}`);
      break;
    case 'ADAPTIVE_REPLAY_DONE':
      const ok = data.results?.filter(r => r.success).length;
      const total = data.results?.length;
      taskLog('final', `✓ Adaptif tekrar bitti: ${ok}/${total} başarılı`);
      break;
  }
}

function taskLog(type, text, fullText) {
  const log = document.getElementById('task-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = `[${time}] `;
  const displayText = prefix + text;

  // If there's more detail available (fullText exists), make it expandable
  const hasMore = fullText && fullText.length > 0;
  const isTruncated = hasMore && text.length < fullText?.length;

  if (isTruncated) {
    entry.innerHTML = `<span class="log-summary">${escHtml(displayText)}</span>`;
    entry.title = 'Tıklayarak tam metni göster';
    entry.style.cursor = 'pointer';
    entry.dataset.fulltext = fullText;
    entry.dataset.summary = displayText;
    entry.dataset.expanded = 'false';

    entry.addEventListener('click', () => {
      const expanded = entry.dataset.expanded === 'true';
      if (expanded) {
        // Collapse
        entry.querySelector('.log-summary').textContent = entry.dataset.summary;
        const detail = entry.querySelector('.log-detail');
        if (detail) detail.remove();
        entry.dataset.expanded = 'false';
        entry.title = 'Tıklayarak tam metni göster';
      } else {
        // Expand
        const detail = document.createElement('pre');
        detail.className = 'log-detail';
        detail.textContent = entry.dataset.fulltext;
        entry.appendChild(detail);
        entry.dataset.expanded = 'true';
        entry.title = 'Tıklayarak kısalt';
      }
      log.scrollTop = log.scrollHeight;
    });
  } else {
    entry.textContent = displayText;
  }

  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function clearTaskLog() {
  document.getElementById('task-log').innerHTML = '';
}

// ---- Recordings ----
let selectedRecordingId = null;

function setupRecordings() {
  document.getElementById('rec-toggle-btn').addEventListener('click', toggleRecording);
  document.getElementById('refresh-recs-btn').addEventListener('click', refreshRecordings);
}

async function toggleRecording() {
  await getCurrentTab();
  const btn = document.getElementById('rec-toggle-btn');

  if (!isRecording) {
    const name = document.getElementById('rec-name-input').value.trim() || null;
    try {
      await bg('RECORDING_START', { tabId: currentTabId, name });
      isRecording = true;
      btn.textContent = '⏹ Kaydı Durdur';
      btn.classList.add('recording');
    } catch (err) {
      alert('Kayıt başlatılamadı: ' + err.message);
    }
  } else {
    try {
      await bg('RECORDING_STOP', { tabId: currentTabId });
      isRecording = false;
      btn.textContent = '⏺ Kayıt Başlat';
      btn.classList.remove('recording');
      document.getElementById('rec-name-input').value = '';
      setTimeout(refreshRecordings, 500);
    } catch (err) {
      alert('Kayıt durdurulamadı: ' + err.message);
    }
  }
}

function handleRecordingStatus(status, recording) {
  if (status === 'started') {
    isRecording = true;
    const btn = document.getElementById('rec-toggle-btn');
    btn.textContent = '⏹ Kaydı Durdur';
    btn.classList.add('recording');
  } else if (status === 'stopped') {
    isRecording = false;
    const btn = document.getElementById('rec-toggle-btn');
    btn.textContent = '⏺ Kayıt Başlat';
    btn.classList.remove('recording');
    refreshRecordings();
  }
}

async function refreshRecordings() {
  try {
    const recordings = await bg('GET_RECORDINGS', {});
    renderRecordings(recordings);
  } catch {}
}

function renderRecordings(recordings) {
  const list = document.getElementById('rec-list');

  if (!recordings || recordings.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⏺</div>
      <div>Henüz kayıt yok</div>
      <div style="font-size:11px;">Kayıt başlatmak için yukarıdaki butonu kullan</div>
    </div>`;
    return;
  }

  list.innerHTML = '';
  recordings.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'rec-item' + (rec.id === selectedRecordingId ? ' selected' : '');
    item.dataset.id = rec.id;

    const duration = rec.duration ? `${(rec.duration / 1000).toFixed(1)}s` : '—';
    const date = new Date(rec.startTime).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    item.innerHTML = `
      <div class="rec-name">
        <span>${escHtml(rec.name)}</span>
        <span class="chip chip-blue">${rec.eventCount} eylem</span>
      </div>
      <div class="rec-meta">${date} · ${duration}</div>
      <div class="rec-url" title="${escHtml(rec.startUrl)}">${escHtml(rec.startUrl || '')}</div>
      <div class="rec-actions">
        <button class="btn btn-success btn-sm" data-action="replay" data-id="${rec.id}">▶ Tekrarla</button>
        <button class="btn btn-secondary btn-sm" data-action="rename" data-id="${rec.id}">✎ Yeniden Adlandır</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${rec.id}">✕ Sil</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      if (action === 'replay') replayRecording(id);
      else if (action === 'delete') deleteRecording(id);
      else if (action === 'rename') renameRecording(id, rec.name);
      else {
        selectedRecordingId = rec.id;
        document.querySelectorAll('.rec-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      }
    });

    list.appendChild(item);
  });
}

async function replayRecording(id) {
  await getCurrentTab();
  const adaptive = document.getElementById('adaptive-toggle').checked;

  // Switch to task tab to show log
  document.querySelector('[data-tab="task"]').click();
  clearTaskLog();
  taskLog('info', `Tekrar başlatılıyor${adaptive ? ' (Adaptif mod)' : ''}...`);

  try {
    const result = await bg('REPLAY_RECORDING', {
      recordingId: id,
      tabId: currentTabId,
      adaptive
    });

    const ok = result?.results?.filter(r => r.success).length ?? 0;
    const total = result?.results?.length ?? 0;
    taskLog('final', `✓ Tekrar tamamlandı: ${ok}/${total} eylem başarılı`);
  } catch (err) {
    taskLog('error', '✗ Tekrar hatası: ' + err.message);
  }
}

async function deleteRecording(id) {
  if (!confirm('Bu kaydı silmek istediğinden emin misin?')) return;
  try {
    await bg('DELETE_RECORDING', { id });
    refreshRecordings();
  } catch (err) {
    alert('Silinemedi: ' + err.message);
  }
}

async function renameRecording(id, currentName) {
  const newName = prompt('Yeni ad:', currentName);
  if (!newName || newName === currentName) return;
  // Background doesn't have rename handler yet — send via generic storage
  try {
    const recordings = await bg('GET_RECORDINGS', {});
    // We'll use a workaround — update via settings message
    chrome.storage.local.get('agentia_recordings', (data) => {
      const store = data.agentia_recordings || {};
      if (store[id]) {
        store[id].name = newName;
        chrome.storage.local.set({ agentia_recordings: store }, () => refreshRecordings());
      }
    });
  } catch {}
}

// ---- History ----
function setupHistory() {
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (!confirm('Tüm görev geçmişini silmek istediğinden emin misin?')) return;
    try {
      await bg('CLEAR_TASK_HISTORY', {});
      refreshHistory();
    } catch (err) {
      alert('Silinemedi: ' + err.message);
    }
  });
}

async function refreshHistory() {
  try {
    const history = await bg('GET_TASK_HISTORY', {});
    renderHistory(history);
  } catch {}
}

function renderHistory(history) {
  const list = document.getElementById('history-list');

  if (!history || history.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🕓</div>
      <div>Henüz görev geçmişi yok</div>
      <div style="font-size:11px;">Bir görev çalıştırdığında burada görünecek</div>
    </div>`;
    return;
  }

  list.innerHTML = '';
  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const date = new Date(entry.createdAt).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    const statusChip = entry.success
      ? '<span class="chip chip-green">✓ Başarılı</span>'
      : '<span class="chip chip-red">✗ Başarısız</span>';

    const preview = (entry.result || '').substring(0, 100) + (entry.result?.length > 100 ? '...' : '');
    const reportBtn = entry.reportFileKey
      ? `<button class="btn btn-secondary btn-sm" data-action="view-report" data-filekey="${escHtml(entry.reportFileKey)}">📄 Raporu Görüntüle</button>`
      : '';

    item.innerHTML = `
      <div class="history-header">
        <div class="history-task">${escHtml(entry.task)}</div>
        ${statusChip}
      </div>
      <div class="history-result">${escHtml(preview)}</div>
      <div class="history-meta">${date}</div>
      <div class="history-actions">
        ${reportBtn}
        <button class="btn btn-secondary btn-sm" data-action="continue" data-id="${entry.id}">💬 Devam Et</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${entry.id}">✕ Sil</button>
      </div>
    `;

    const reportBtnEl = item.querySelector('[data-action="view-report"]');
    if (reportBtnEl) {
      reportBtnEl.addEventListener('click', () => viewReport(reportBtnEl.dataset.filekey));
    }
    item.querySelector('[data-action="continue"]').addEventListener('click', () => {
      continueFromHistory(entry);
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('Bu görevi geçmişten silmek istediğinden emin misin?')) return;
      try {
        await bg('DELETE_TASK_HISTORY', { id: entry.id });
        refreshHistory();
      } catch {}
    });

    list.appendChild(item);
  });
}

async function viewReport(fileKey) {
  try {
    await bg('FILE_OPEN', { fileKey });
  } catch (err) {
    alert('Rapor açılamadı: ' + err.message);
  }
}

function continueFromHistory(entry) {
  // Load the task's full message history into the task session context
  // so the continue flow runs with full tool support (not plain chat)
  taskSessionMessages = entry.messages || [];
  taskSessionName = entry.task || '';

  // Show the task in the task log, hide new task area, show session header
  clearTaskLog();
  enterTaskSession(entry.task);

  taskLog('info', `🕓 Geçmiş görev yüklendi: ${entry.task}`);
  if (entry.result) {
    taskLog('final', (entry.success ? '✓' : '✗') + ' ' + entry.result.substring(0, 200));
  }

  // Switch to task tab and show continue area
  document.querySelector('[data-tab="task"]').click();
  showContinueArea(entry.success !== false);
  document.getElementById('task-continue-input').placeholder = '✏️ Bu göreve ek talimat yaz veya devam et...';
}

// ---- Helpers ----
function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Memory Tab ----
async function loadMemory() {
  try {
    const data = await bgWithRetry('MEMORY_GET', {});
    renderMemory(data);
  } catch (err) {
    document.getElementById('memory-learned-list').textContent = 'Hata: ' + err.message;
  }
}

let _learnedFilter = '';

function renderMemory(data) {
  // Learned facts
  const learnedEl = document.getElementById('memory-learned-list');
  const learned = data.learned || [];
  if (learned.length > 0) {
    // Category filter dropdown
    const cats = [...new Set(learned.map(l => l.category || 'genel'))].sort();
    if (_learnedFilter && !cats.includes(_learnedFilter)) _learnedFilter = '';
    const filtered = _learnedFilter ? learned.filter(l => (l.category || 'genel') === _learnedFilter) : learned;
    const filterHtml = cats.length > 1
      ? `<select id="learned-cat-filter" style="margin-bottom:8px; padding:4px 6px; background:var(--bg2); color:var(--text1); border:1px solid var(--border); border-radius:6px; font-size:12px;">
          <option value="">Tüm kategoriler (${learned.length})</option>
          ${cats.map(c => `<option value="${escHtml(c)}" ${c === _learnedFilter ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
        </select>`
      : '';
    learnedEl.innerHTML = filterHtml + filtered.map(l => `
      <div style="margin-bottom:8px; padding:8px; background:var(--bg3); border-radius:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="font-weight:600; color:var(--text1);">${escHtml(l.topic)}</div>
          <span style="font-size:10px; padding:1px 6px; background:var(--bg2); color:var(--text3); border-radius:8px;">${escHtml(l.category || 'genel')}</span>
        </div>
        <div style="color:var(--text2); margin-top:2px;">${escHtml(l.info)}</div>
        <button data-action="delete-learned" data-id="${escHtml(l.id)}" style="font-size:11px; color:var(--danger); background:none; border:none; cursor:pointer; margin-top:4px;">Sil</button>
      </div>
    `).join('');
    const filterEl = learnedEl.querySelector('#learned-cat-filter');
    if (filterEl) filterEl.addEventListener('change', () => { _learnedFilter = filterEl.value; renderMemory(data); });
    learnedEl.querySelectorAll('[data-action="delete-learned"]').forEach(btn => {
      btn.addEventListener('click', () => deleteLearned(btn.dataset.id));
    });
  } else {
    learnedEl.innerHTML = '<div style="color:var(--text3);">Henüz öğrenilen bilgi yok. Agent görevler sırasında otomatik öğrenir.</div>';
  }

  // Task memory
  const tasksEl = document.getElementById('memory-tasks-list');
  if (data.taskMemory && data.taskMemory.length > 0) {
    tasksEl.innerHTML = data.taskMemory.slice(0, 10).map(t => `
      <div style="margin-bottom:6px; padding:6px 8px; background:var(--bg3); border-radius:6px;">
        <span style="color:${t.success ? 'var(--success)' : 'var(--danger)'};">${t.success ? '✓' : '✗'}</span>
        <span style="color:var(--text1);">${escHtml(t.task)}</span>
        <div style="font-size:11px; color:var(--text3); margin-top:2px;">${escHtml(t.summary)}</div>
      </div>
    `).join('');
  } else {
    tasksEl.innerHTML = '<div style="color:var(--text3);">Henüz görev geçmişi yok.</div>';
  }

  // Chat memory
  const chatsEl = document.getElementById('memory-chats-list');
  if (data.chatMemory && data.chatMemory.length > 0) {
    chatsEl.innerHTML = data.chatMemory.slice(0, 5).map(c => `
      <div style="margin-bottom:6px; padding:6px 8px; background:var(--bg3); border-radius:6px;">
        <div style="color:var(--text2);">${escHtml(c.summary)}</div>
        ${c.topics?.length ? '<div style="font-size:11px; color:var(--text3); margin-top:2px;">' + c.topics.map(t => '#' + escHtml(t)).join(' ') + '</div>' : ''}
      </div>
    `).join('');
  } else {
    chatsEl.innerHTML = '<div style="color:var(--text3);">Henüz sohbet özeti yok.</div>';
  }

  // Preferences
  const prefsEl = document.getElementById('memory-prefs-list');
  const prefs = data.preferences || {};
  if (Object.keys(prefs).length > 0) {
    prefsEl.innerHTML = Object.entries(prefs).map(([k, v]) => `
      <div style="margin-bottom:4px; padding:4px 8px; background:var(--bg3); border-radius:4px;">
        <span style="color:var(--accent);">${escHtml(k)}</span>: <span style="color:var(--text2);">${escHtml(String(v))}</span>
      </div>
    `).join('');
  } else {
    prefsEl.innerHTML = '<div style="color:var(--text3);">Henüz tercih kaydedilmedi.</div>';
  }

  // Site Recipes
  const recipesEl = document.getElementById('memory-recipes-list');
  if (data.recipes && data.recipes.length > 0) {
    recipesEl.innerHTML = data.recipes.slice(0, 10).map(r => `
      <div style="margin-bottom:8px; padding:8px; background:var(--bg3); border-radius:6px;">
        <div style="font-weight:600; color:var(--accent);">${escHtml(r.site)}</div>
        <div style="color:var(--text1); margin-top:2px;">${escHtml(r.task)}</div>
        <div style="font-size:11px; color:var(--text3); margin-top:4px;">${r.steps.length} adım${r.useCount ? ' · ' + r.useCount + ' kez kullanıldı' : ''}</div>
        <button data-action="delete-recipe" data-id="${escHtml(r.id)}" style="font-size:11px; color:var(--danger); background:none; border:none; cursor:pointer; margin-top:4px;">Sil</button>
      </div>
    `).join('');
    recipesEl.querySelectorAll('[data-action="delete-recipe"]').forEach(btn => {
      btn.addEventListener('click', () => deleteRecipe(btn.dataset.id));
    });
  } else {
    recipesEl.innerHTML = '<div style="color:var(--text3);">Henüz site reçetesi yok. Ajan başarıyla tamamladığı işlemleri otomatik kaydeder.</div>';
  }
}

async function deleteLearned(id) {
  await bgWithRetry('MEMORY_DELETE_LEARNED', { id });
  loadMemory();
}

async function deleteRecipe(id) {
  await bgWithRetry('MEMORY_DELETE_RECIPE', { id });
  loadMemory();
}

async function clearMemory() {
  if (!confirm('Tüm memory verileri silinecek. Emin misiniz?')) return;
  await bgWithRetry('MEMORY_CLEAR', {});
  loadMemory();
}

// Bind memory tab events
document.getElementById('memory-refresh-btn')?.addEventListener('click', loadMemory);
document.getElementById('memory-clear-btn')?.addEventListener('click', clearMemory);

// Load memory when tab is shown
document.querySelectorAll('[data-tab="memory"]').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(loadMemory, 100);
  });
});

// ---- Studio (Profil) Tab: Personas, Knowledge Bases, Skills ----
let studioPersonas = [];
let studioKbs = [];
let studioSkills = [];
let activePersonaId = null;
let currentKbId = null;

async function renderLocalFiles() {
  const el = document.getElementById('local-files-list');
  if (!el) return;
  try {
    const handles = await listHandles();
    if (handles.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);">Henüz yetkili dosya/klasör yok. Yukarıdan seçin.</div>';
      return;
    }
    el.innerHTML = handles.map(h => `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:8px; background:var(--bg3); border-radius:6px;">
        <span>${h.kind === 'directory' ? '📁' : '📄'}</span>
        <div style="flex:1; min-width:0;">
          <div style="color:var(--text1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(h.name)}</div>
          <div style="font-size:10px; color:var(--text3);">id: ${escHtml(h.id)}</div>
        </div>
        <button data-action="remove-local" data-id="${escHtml(h.id)}" style="font-size:11px; color:var(--danger); background:none; border:none; cursor:pointer;">Kaldır</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-action="remove-local"]').forEach(btn => {
      btn.addEventListener('click', async () => { await removeHandle(btn.dataset.id); renderLocalFiles(); });
    });
  } catch (err) {
    el.textContent = 'Hata: ' + err.message;
  }
}

function setupStudio() {
  // Sub-nav switching
  document.querySelectorAll('.studio-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.studio-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.studio-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`studio-${btn.dataset.studio}`).classList.add('active');
    });
  });

  // Refresh when the tab is opened
  document.querySelectorAll('[data-tab="studio"]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(refreshStudio, 100));
  });

  // Local files
  document.getElementById('local-pick-file').addEventListener('click', async () => {
    try { await pickFiles(); await renderLocalFiles(); }
    catch (err) { if (err.name !== 'AbortError') alert('Dosya seçilemedi: ' + err.message); }
  });
  document.getElementById('local-pick-dir').addEventListener('click', async () => {
    try { await pickDirectory(); await renderLocalFiles(); }
    catch (err) { if (err.name !== 'AbortError') alert('Klasör seçilemedi: ' + err.message); }
  });
  document.querySelectorAll('[data-studio="files"]').forEach(btn => {
    btn.addEventListener('click', () => renderLocalFiles());
  });

  // Personas
  document.getElementById('persona-new-btn').addEventListener('click', () => openPersonaForm(null));
  document.getElementById('persona-cancel-btn').addEventListener('click', () => {
    document.getElementById('persona-form').style.display = 'none';
  });
  document.getElementById('persona-save-btn').addEventListener('click', savePersonaForm);

  // Knowledge bases
  document.getElementById('kb-create-btn').addEventListener('click', createKb);
  document.getElementById('kb-back-btn').addEventListener('click', showKbList);
  document.getElementById('kb-reindex-btn').addEventListener('click', reindexCurrentKb);
  document.getElementById('kb-add-text-btn').addEventListener('click', addTextDocToKb);
  document.getElementById('kb-file-input').addEventListener('change', handleKbFileUpload);
  document.getElementById('kb-save-page-btn').addEventListener('click', savePageToKb);
  document.getElementById('kb-research-btn').addEventListener('click', startKbResearch);
  document.getElementById('kb-search-btn').addEventListener('click', runKbSearchTest);
  document.getElementById('kb-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runKbSearchTest();
  });

  // Skills
  document.getElementById('skill-new-btn').addEventListener('click', () => openSkillForm(null));
  document.getElementById('skill-cancel-btn').addEventListener('click', () => {
    document.getElementById('skill-form').style.display = 'none';
  });
  document.getElementById('skill-save-btn').addEventListener('click', saveSkillForm);
  document.getElementById('skill-type').addEventListener('change', toggleSkillTypeRows);
  document.getElementById('skill-import-select').addEventListener('change', importSkillFromRecording);

  // Header persona switcher
  document.getElementById('persona-switcher').addEventListener('change', async (e) => {
    try {
      const persona = await bg('PERSONA_SET_ACTIVE', { id: e.target.value });
      activePersonaId = persona.id;
      const s = await bg('GET_SETTINGS', {});
      updateModelBadge(persona.modelOverride || s.model);
      renderPersonaList();
    } catch (err) {
      console.warn('[Agentia] Persona switch failed:', err.message);
    }
  });
}

async function refreshStudio() {
  try {
    const [personaData, kbs, skills] = await Promise.all([
      bgWithRetry('PERSONA_LIST', {}),
      bgWithRetry('KB_LIST', {}),
      bgWithRetry('SKILL_LIST', {})
    ]);
    studioPersonas = personaData.personas || [];
    activePersonaId = personaData.activePersonaId;
    studioKbs = kbs || [];
    studioSkills = skills || [];
    renderPersonaList();
    renderKbList();
    renderSkillList();
    populateSkillImportSelect();
    populatePersonaSwitcherFromState();
  } catch (err) {
    document.getElementById('persona-list').textContent = 'Hata: ' + err.message;
  }
}

// ---- Persona switcher (header) ----
async function loadPersonaSwitcher() {
  try {
    const data = await bgWithRetry('PERSONA_LIST', {});
    studioPersonas = data.personas || [];
    activePersonaId = data.activePersonaId;
    populatePersonaSwitcherFromState();
    // Reflect the active persona's model override in the badge
    const active = studioPersonas.find(p => p.id === activePersonaId);
    if (active?.modelOverride) updateModelBadge(active.modelOverride);
  } catch (e) {
    console.warn('[Agentia] Persona switcher load failed:', e.message);
  }
}

function populatePersonaSwitcherFromState() {
  const sel = document.getElementById('persona-switcher');
  sel.innerHTML = studioPersonas
    .map(p => `<option value="${escHtml(p.id)}"${p.id === activePersonaId ? ' selected' : ''}>${escHtml(p.emoji)} ${escHtml(p.name)}</option>`)
    .join('');
}

// ---- Personas ----
function renderPersonaList() {
  const el = document.getElementById('persona-list');
  if (studioPersonas.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);">Henüz kişilik yok.</div>';
    return;
  }
  el.innerHTML = studioPersonas.map(p => {
    const isActive = p.id === activePersonaId;
    const kbNames = (p.kbIds || []).map(id => studioKbs.find(k => k.id === id)?.name).filter(Boolean);
    const skillNames = (p.skillIds || []).map(id => studioSkills.find(s => s.id === id)?.name).filter(Boolean);
    const details = [
      p.modelOverride ? `model: ${escHtml(p.modelOverride)}` : '',
      kbNames.length ? `KB: ${escHtml(kbNames.join(', '))}` : '',
      skillNames.length ? `Yetenek: ${escHtml(skillNames.join(', '))}` : ''
    ].filter(Boolean).join(' · ');
    return `
      <div class="studio-card${isActive ? ' active-persona' : ''}">
        <div class="studio-card-title">${escHtml(p.emoji)} ${escHtml(p.name)} ${isActive ? '<span style="font-size:10px; color:var(--accent);">● aktif</span>' : ''}</div>
        ${p.personalityPrompt ? `<div class="studio-card-desc">${escHtml(p.personalityPrompt.substring(0, 120))}${p.personalityPrompt.length > 120 ? '…' : ''}</div>` : ''}
        ${details ? `<div class="studio-card-desc">${details}</div>` : ''}
        <div class="studio-card-actions">
          ${!isActive ? `<button data-action="persona-activate" data-id="${escHtml(p.id)}">Aktif Yap</button>` : ''}
          <button data-action="persona-edit" data-id="${escHtml(p.id)}">Düzenle</button>
          ${p.id !== 'default' ? `<button data-action="persona-delete" data-id="${escHtml(p.id)}" class="danger">Sil</button>` : ''}
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-action="persona-activate"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const persona = await bg('PERSONA_SET_ACTIVE', { id: btn.dataset.id });
      activePersonaId = persona.id;
      const s = await bg('GET_SETTINGS', {});
      updateModelBadge(persona.modelOverride || s.model);
      populatePersonaSwitcherFromState();
      renderPersonaList();
    });
  });
  el.querySelectorAll('[data-action="persona-edit"]').forEach(btn => {
    btn.addEventListener('click', () => openPersonaForm(studioPersonas.find(p => p.id === btn.dataset.id)));
  });
  el.querySelectorAll('[data-action="persona-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Bu kişilik silinecek. Emin misiniz?')) return;
      await bg('PERSONA_DELETE', { id: btn.dataset.id });
      await refreshStudio();
      loadPersonaSwitcher();
    });
  });
}

let editingPersonaId = null;

function openPersonaForm(persona) {
  editingPersonaId = persona?.id || null;
  document.getElementById('persona-form').style.display = 'block';
  document.getElementById('persona-form-title').textContent = persona ? `Düzenle: ${persona.name}` : 'Yeni Kişilik';
  document.getElementById('persona-name').value = persona?.name || '';
  document.getElementById('persona-emoji').value = persona?.emoji || '';
  document.getElementById('persona-prompt').value = persona?.personalityPrompt || '';
  document.getElementById('persona-model').value = persona?.modelOverride || '';
  document.getElementById('persona-temp').value = persona?.temperatureOverride ?? '';

  const kbChecks = document.getElementById('persona-kb-checks');
  kbChecks.innerHTML = studioKbs.length
    ? studioKbs.map(kb => `
        <label style="display:flex; align-items:center; gap:6px; margin-bottom:2px; cursor:pointer;">
          <input type="checkbox" class="persona-kb-check" value="${escHtml(kb.id)}"${persona?.kbIds?.includes(kb.id) ? ' checked' : ''}>
          ${escHtml(kb.name)} <span style="color:var(--text3);">(${kb.docCount} doküman)</span>
        </label>`).join('')
    : '<span style="color:var(--text3);">Henüz bilgi tabanı yok — önce 📚 sekmesinden oluşturun.</span>';

  const skillChecks = document.getElementById('persona-skill-checks');
  skillChecks.innerHTML = studioSkills.length
    ? studioSkills.map(s => `
        <label style="display:flex; align-items:center; gap:6px; margin-bottom:2px; cursor:pointer;">
          <input type="checkbox" class="persona-skill-check" value="${escHtml(s.id)}"${persona?.skillIds?.includes(s.id) ? ' checked' : ''}>
          ${escHtml(s.name)} <span style="color:var(--text3);">[${s.type}]</span>
        </label>`).join('')
    : '<span style="color:var(--text3);">Henüz yetenek yok — 🛠 sekmesinden oluşturabilirsiniz.</span>';
}

async function savePersonaForm() {
  const payload = {
    id: editingPersonaId || undefined,
    name: document.getElementById('persona-name').value.trim(),
    emoji: document.getElementById('persona-emoji').value.trim(),
    personalityPrompt: document.getElementById('persona-prompt').value,
    kbIds: [...document.querySelectorAll('.persona-kb-check:checked')].map(c => c.value),
    skillIds: [...document.querySelectorAll('.persona-skill-check:checked')].map(c => c.value),
    modelOverride: document.getElementById('persona-model').value.trim(),
    temperatureOverride: document.getElementById('persona-temp').value
  };
  if (!payload.name) { alert('Kişilik adı gerekli'); return; }
  try {
    await bg('PERSONA_SAVE', payload);
    document.getElementById('persona-form').style.display = 'none';
    await refreshStudio();
    loadPersonaSwitcher();
  } catch (err) {
    alert('Kaydedilemedi: ' + err.message);
  }
}

// ---- Knowledge Bases ----
function renderKbList() {
  const el = document.getElementById('kb-list');
  if (studioKbs.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);">Henüz bilgi tabanı yok. Yukarıdan bir tane oluşturun; sonra doküman ekleyip bir kişiliğe bağlayın.</div>';
    return;
  }
  el.innerHTML = studioKbs.map(kb => `
    <div class="studio-card">
      <div class="studio-card-title">📚 ${escHtml(kb.name)}</div>
      <div class="studio-card-desc">${kb.docCount} doküman · ${kb.chunkCount} parça${kb.description ? ' — ' + escHtml(kb.description) : ''}</div>
      <div class="studio-card-actions">
        <button data-action="kb-open" data-id="${escHtml(kb.id)}">Aç</button>
        <button data-action="kb-delete" data-id="${escHtml(kb.id)}" class="danger">Sil</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('[data-action="kb-open"]').forEach(btn => {
    btn.addEventListener('click', () => openKbDetail(btn.dataset.id));
  });
  el.querySelectorAll('[data-action="kb-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Bilgi tabanı ve tüm dokümanları silinecek. Emin misiniz?')) return;
      await bg('KB_DELETE', { id: btn.dataset.id });
      await refreshStudio();
    });
  });
}

async function createKb() {
  const input = document.getElementById('kb-new-name');
  const name = input.value.trim();
  if (!name) return;
  await bg('KB_CREATE', { name });
  input.value = '';
  await refreshStudio();
}

function showKbList() {
  currentKbId = null;
  document.getElementById('kb-detail').style.display = 'none';
  document.getElementById('kb-main').style.display = 'block';
}

async function openKbDetail(kbId) {
  currentKbId = kbId;
  const kb = studioKbs.find(k => k.id === kbId);
  document.getElementById('kb-detail-title').textContent = `📚 ${kb?.name || ''}`;
  document.getElementById('kb-main').style.display = 'none';
  document.getElementById('kb-detail').style.display = 'block';
  document.getElementById('kb-add-status').textContent = '';
  document.getElementById('kb-search-results').innerHTML = '';
  await refreshKbDocs();
}

function docStatusBadge(doc) {
  const map = {
    done: ['done', '✓ indekslendi'],
    partial: ['partial', '⏳ kısmi'],
    pending: ['pending', '⏳ bekliyor'],
    failed: ['keyword', '🔤 anahtar kelime modu'],
    none: ['keyword', '🔤 anahtar kelime modu']
  };
  const [cls, label] = map[doc.embedStatus] || ['keyword', doc.embedStatus];
  return `<span class="kb-status-badge ${cls}" data-doc-badge="${escHtml(doc.id)}">${label}</span>`;
}

async function refreshKbDocs() {
  if (!currentKbId) return;
  const el = document.getElementById('kb-doc-list');
  try {
    const docs = await bg('KB_LIST_DOCS', { kbId: currentKbId });
    if (!docs || docs.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);">Henüz doküman yok.</div>';
      return;
    }
    const typeIcons = { text: '📝', file: '📄', pdf: '📕', page: '🌐', research: '🔎' };
    el.innerHTML = docs.map(d => `
      <div class="studio-card">
        <div class="studio-card-title">${typeIcons[d.sourceType] || '📄'} ${escHtml(d.name)} ${docStatusBadge(d)}</div>
        <div class="studio-card-desc">${d.chunkCount} parça · ${Math.round(d.charCount / 1000)}k karakter${d.sourceUrl ? ' · ' + escHtml(d.sourceUrl.substring(0, 60)) : ''}</div>
        <div class="studio-card-actions">
          <button data-action="doc-view" data-id="${escHtml(d.id)}">Görüntüle</button>
          <button data-action="doc-delete" data-id="${escHtml(d.id)}" class="danger">Sil</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-action="doc-delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await bg('KB_DELETE_DOC', { id: btn.dataset.id });
        await refreshKbDocs();
      });
    });
    el.querySelectorAll('[data-action="doc-view"]').forEach(btn => {
      btn.addEventListener('click', () => viewKbDoc(btn.dataset.id));
    });
  } catch (err) {
    el.textContent = 'Hata: ' + err.message;
  }
}

// View a document's stored text in a new viewer tab
async function viewKbDoc(docId) {
  try {
    const { text } = await bg('KB_GET_DOC_TEXT', { id: docId });
    const html = `<pre style="white-space:pre-wrap; font-family:system-ui; padding:20px; line-height:1.5;">${escHtml(text || '(boş)')}</pre>`;
    await bg('CREATE_FILE', { name: 'KB Doküman', content: html, type: 'html' });
  } catch (err) {
    alert('Doküman görüntülenemedi: ' + err.message);
  }
}

// Start an agent task that researches a topic and adds findings to this KB
async function startKbResearch() {
  const topicEl = document.getElementById('kb-research-topic');
  const topic = topicEl.value.trim();
  if (!topic || !currentKbId) return;
  await getCurrentTab();
  if (!currentTabId) { alert('Aktif sekme bulunamadı. Lütfen bir sayfa açın.'); return; }

  const task = `Şu konuyu web'de araştır ve topladığın bilgileri kb_add_document aracıyla şu bilgi tabanına ekle (kbId="${currentKbId}"). Her önemli kaynak/konu için ayrı bir kb_add_document çağrısı yap; name alanına açıklayıcı bir başlık, text alanına özetlenmiş içeriği, sourceUrl alanına kaynağın URL'sini koy. Konu: ${topic}`;

  topicEl.value = '';
  switchTab('task');
  taskSessionMessages = null;
  enterTaskSession(task);
  setTaskRunning(true);
  clearTaskLog();
  taskLog('info', `🔎 Araştırma başlatıldı → "${topic}" bilgi tabanına eklenecek`);
  try {
    await bgWithRetry('AGENT_RUN_TASK', { task, tabId: currentTabId, messages: null });
  } catch (err) {
    taskLog('error', '✗ Başlatılamadı: ' + err.message);
    setTaskRunning(false);
  }
}

function setKbAddStatus(msg, isError = false) {
  const el = document.getElementById('kb-add-status');
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--text2)';
}

async function addTextDocToKb() {
  const text = document.getElementById('kb-paste-text').value.trim();
  if (!text || !currentKbId) return;
  const name = document.getElementById('kb-paste-name').value.trim() || `Not ${new Date().toLocaleDateString('tr-TR')}`;
  setKbAddStatus('⏳ Ekleniyor ve indeksleniyor...');
  await bg('KB_ADD_DOC', { kbId: currentKbId, name, sourceType: 'text', content: text });
  document.getElementById('kb-paste-text').value = '';
  document.getElementById('kb-paste-name').value = '';
}

async function handleKbFileUpload(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // Allow re-selecting the same file
  if (!file || !currentKbId) return;
  if (file.size > 20 * 1024 * 1024) {
    setKbAddStatus('Dosya çok büyük (max 20MB)', true);
    return;
  }
  setKbAddStatus(`⏳ "${file.name}" okunuyor...`);
  try {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);
      setKbAddStatus('⏳ PDF işleniyor ve indeksleniyor...');
      await bg('KB_ADD_DOC', { kbId: currentKbId, name: file.name, sourceType: 'pdf', contentBase64: base64 });
    } else {
      const text = await file.text();
      setKbAddStatus('⏳ Ekleniyor ve indeksleniyor...');
      await bg('KB_ADD_DOC', { kbId: currentKbId, name: file.name, sourceType: 'file', content: text });
    }
  } catch (err) {
    setKbAddStatus('Hata: ' + err.message, true);
  }
}

async function savePageToKb() {
  if (!currentKbId) return;
  setKbAddStatus('⏳ Sayfa içeriği alınıyor...');
  try {
    await bg('KB_ADD_DOC', { kbId: currentKbId, sourceType: 'page', tabId: currentTabId || undefined });
  } catch (err) {
    setKbAddStatus('Hata: ' + err.message, true);
  }
}

async function reindexCurrentKb() {
  if (!currentKbId) return;
  setKbAddStatus('⏳ Yeniden indeksleniyor...');
  await bg('KB_REINDEX', { kbId: currentKbId });
}

async function runKbSearchTest() {
  const query = document.getElementById('kb-search-input').value.trim();
  const el = document.getElementById('kb-search-results');
  if (!query || !currentKbId) return;
  el.innerHTML = 'Aranıyor...';
  try {
    const results = await bg('KB_SEARCH', { query, kbIds: [currentKbId], topK: 5 });
    if (!results || results.length === 0) {
      el.innerHTML = '<div style="color:var(--text3);">Sonuç bulunamadı.</div>';
      return;
    }
    el.innerHTML = results.map(r => `
      <div class="studio-card">
        <div class="studio-card-desc">
          <b>${escHtml(r.docName)}</b>${r.page ? ` (sayfa ${r.page})` : ''}
          · skor ${r.score} · ${r.method === 'vector' ? '🧭 vektör' : '🔤 anahtar kelime'}
        </div>
        <div style="color:var(--text2); margin-top:4px;">${escHtml(r.text.substring(0, 300))}${r.text.length > 300 ? '…' : ''}</div>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);">Hata: ${escHtml(err.message)}</div>`;
  }
}

// Live embed progress events from background
function handleKbEvent(data) {
  if (!data) return;
  if (data.type === 'EMBED_PROGRESS') {
    setKbAddStatus(`⏳ İndeksleniyor... ${data.done}/${data.total}`);
    const badge = document.querySelector(`[data-doc-badge="${data.docId}"]`);
    if (badge) { badge.textContent = `⏳ ${data.done}/${data.total}`; badge.className = 'kb-status-badge partial'; }
  } else if (data.type === 'EMBED_DONE') {
    const mode = data.embedStatus === 'done' ? 'vektör indeksi hazır' :
      (data.embedStatus === 'none' || data.embedStatus === 'failed') ? 'anahtar kelime modunda eklendi' : 'kısmen indekslendi';
    setKbAddStatus(`✓ Doküman eklendi (${data.chunkCount} parça, ${mode})`);
    refreshKbDocs();
    bgWithRetry('KB_LIST', {}).then(kbs => { studioKbs = kbs || []; renderKbList(); }).catch(() => {});
  } else if (data.type === 'REINDEX_DONE') {
    setKbAddStatus('✓ Yeniden indeksleme tamamlandı');
    refreshKbDocs();
  } else if (data.type === 'EMBED_ERROR') {
    setKbAddStatus('Hata: ' + (data.error || 'indeksleme başarısız'), true);
    refreshKbDocs();
  }
}

// ---- Skills ----
function renderSkillList() {
  const el = document.getElementById('skill-list');
  if (studioSkills.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);">Henüz yetenek yok. Prompt yeteneği (talimat paketi) oluşturun veya bir kaydı makroya dönüştürün.</div>';
    return;
  }
  el.innerHTML = studioSkills.map(s => `
    <div class="studio-card">
      <div class="studio-card-title" style="display:flex; align-items:center; gap:6px;">
        ${s.type === 'macro' ? '🎬' : '📜'} ${escHtml(s.name)}
        <span class="kb-status-badge">${s.type}</span>
        <label class="toggle" style="margin-left:auto;" title="Global olarak etkin (tüm kişiliklerde görünür)">
          <input type="checkbox" class="skill-enable-check" data-id="${escHtml(s.id)}"${s.enabled ? ' checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
      <div class="studio-card-desc">${escHtml(s.description || '')}${s.type === 'macro' ? ` · ${(s.steps || []).length} adım` : ''}</div>
      <div class="studio-card-actions">
        <button data-action="skill-edit" data-id="${escHtml(s.id)}">Düzenle</button>
        <button data-action="skill-delete" data-id="${escHtml(s.id)}" class="danger">Sil</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.skill-enable-check').forEach(check => {
    check.addEventListener('change', async () => {
      await bg('SKILL_SET_ENABLED', { id: check.dataset.id, enabled: check.checked });
    });
  });
  el.querySelectorAll('[data-action="skill-edit"]').forEach(btn => {
    btn.addEventListener('click', () => openSkillForm(studioSkills.find(s => s.id === btn.dataset.id)));
  });
  el.querySelectorAll('[data-action="skill-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Bu yetenek silinecek. Emin misiniz?')) return;
      await bg('SKILL_DELETE', { id: btn.dataset.id });
      await refreshStudio();
    });
  });
}

let editingSkillId = null;

function toggleSkillTypeRows() {
  const isMacro = document.getElementById('skill-type').value === 'macro';
  document.getElementById('skill-instructions-row').style.display = isMacro ? 'none' : 'block';
  document.getElementById('skill-steps-row').style.display = isMacro ? 'block' : 'none';
}

function openSkillForm(skill) {
  editingSkillId = skill?.id || null;
  document.getElementById('skill-form').style.display = 'block';
  document.getElementById('skill-form-title').textContent = skill ? `Düzenle: ${skill.name}` : 'Yeni Yetenek';
  document.getElementById('skill-type').value = skill?.type || 'prompt';
  document.getElementById('skill-name').value = skill?.name || '';
  document.getElementById('skill-desc').value = skill?.description || '';
  document.getElementById('skill-instructions').value = skill?.instructions || '';
  document.getElementById('skill-steps').value = skill?.steps?.length ? JSON.stringify(skill.steps, null, 2) : '';
  toggleSkillTypeRows();
}

async function saveSkillForm() {
  const type = document.getElementById('skill-type').value;
  const payload = {
    id: editingSkillId || undefined,
    type,
    name: document.getElementById('skill-name').value.trim(),
    description: document.getElementById('skill-desc').value.trim(),
    instructions: document.getElementById('skill-instructions').value,
    enabled: true
  };
  if (!payload.name) { alert('Yetenek adı gerekli'); return; }
  if (type === 'macro') {
    const stepsRaw = document.getElementById('skill-steps').value.trim();
    try {
      payload.steps = stepsRaw ? JSON.parse(stepsRaw) : [];
      if (!Array.isArray(payload.steps)) throw new Error('dizi olmalı');
    } catch (err) {
      alert('Adımlar geçerli JSON dizisi olmalı: ' + err.message);
      return;
    }
  }
  try {
    await bg('SKILL_SAVE', payload);
    document.getElementById('skill-form').style.display = 'none';
    await refreshStudio();
  } catch (err) {
    alert('Kaydedilemedi: ' + err.message);
  }
}

async function populateSkillImportSelect() {
  const sel = document.getElementById('skill-import-select');
  try {
    const recordings = await bg('GET_RECORDINGS', {});
    sel.innerHTML = '<option value="">⏺ Kayıttan içe aktar…</option>' +
      (recordings || []).map(r => `<option value="${escHtml(r.id)}">${escHtml(r.name)} (${(r.events || []).length} adım)</option>`).join('');
  } catch (e) {
    console.warn('[Agentia] Recording list load failed:', e.message);
  }
}

async function importSkillFromRecording(e) {
  const recordingId = e.target.value;
  e.target.value = '';
  if (!recordingId) return;
  const name = prompt('Makro yeteneğin adı:');
  if (!name) return;
  try {
    await bg('SKILL_FROM_RECORDING', { recordingId, name, description: `${name} makrosu` });
    await refreshStudio();
  } catch (err) {
    alert('İçe aktarılamadı: ' + err.message);
  }
}

// ---- Chat Persistence ----
async function saveChatHistory() {
  const trimmed = chatHistory.slice(-MAX_CHAT_MESSAGES);
  await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: trimmed });
}

async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get(CHAT_STORAGE_KEY);
    const saved = data[CHAT_STORAGE_KEY] || [];
    chatHistory = saved;
    if (saved.length > 0) {
      const messagesEl = document.getElementById('messages');
      messagesEl.innerHTML = '';
      for (const msg of saved) {
        appendMessage(msg.role, msg.content);
      }
      scrollMessages();
    }
  } catch (e) {
    console.warn('[Agentia] Chat history load failed:', e.message);
  }
}

function setupClearChat() {
  document.getElementById('clear-chat-btn').addEventListener('click', async () => {
    chatHistory = [];
    await chrome.storage.local.remove(CHAT_STORAGE_KEY);
    document.getElementById('messages').innerHTML = '';
    appendMessage('assistant', 'Sohbet temizlendi. Nasıl yardımcı olabilirim?');
  });
}

// ---- Theme (Dark Mode) ----
function getPreferredTheme() {
  const saved = localStorage.getItem('agentia-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀';
  localStorage.setItem('agentia-theme', theme);
}

function setupTheme() {
  setTheme(getPreferredTheme());

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('agentia-theme')) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}

// ---- Keyboard Shortcuts ----
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+1 through Ctrl+7: Switch tabs
    if (e.ctrlKey && e.key >= '1' && e.key <= '7') {
      e.preventDefault();
      const tabButtons = document.querySelectorAll('.tab-btn');
      const idx = parseInt(e.key) - 1;
      if (tabButtons[idx]) tabButtons[idx].click();
      return;
    }

    // Escape: Stop task or blur focus
    if (e.key === 'Escape') {
      if (isRunningTask) {
        e.preventDefault();
        stopTask();
        return;
      }
      document.activeElement?.blur();
      return;
    }

    // /: Focus chat input (only when no input is focused)
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const chatInput = document.getElementById('chat-input');
      if (!document.getElementById('tab-chat').classList.contains('active')) {
        document.querySelector('[data-tab="chat"]').click();
      }
      chatInput?.focus();
      return;
    }
  });
}
