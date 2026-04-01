// Agentia Side Panel — Main UI Logic

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
  await loadSettings();
  await checkConnection();
  await refreshRecordings();
  await refreshHistory();
  getCurrentTab();
});

async function getCurrentTab() {
  try {
    const tab = await bg('TAB_ACTION', { action: 'get_active' });
    currentTabId = tab?.id;
  } catch {}
}

// ---- Background Event Listener ----
chrome.runtime.onMessage.addListener((message) => {
  const { type, data, chunk, status, recording, recordingId } = message;

  if (type === 'STREAM_CHUNK') handleStreamChunk(chunk);
  if (type === 'AGENT_EVENT') handleAgentEvent(data);
  if (type === 'RECORDING_STATUS') handleRecordingStatus(status, recording, recordingId);
  if (type === 'PULL_PROGRESS') handlePullProgress(data);
});

// ---- Tab Switching ----
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
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
    if (s.temperature !== undefined) {
      document.getElementById('temperature').value = s.temperature;
      document.getElementById('temperature-val').textContent = s.temperature;
    }
    if (s.maxTokens) document.getElementById('max-tokens').value = s.maxTokens;
    if (s.systemPrompt) document.getElementById('system-prompt').value = s.systemPrompt;
    if (s.replayDelay) document.getElementById('replay-delay').value = s.replayDelay;
    if (s.maxIterations) document.getElementById('max-iterations').value = s.maxIterations;
    if (s.autoRecord) document.getElementById('auto-record').checked = s.autoRecord;
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
    const settings = {
      ollamaUrl: document.getElementById('ollama-url').value,
      apiKey: document.getElementById('api-key').value,
      useCloud: document.getElementById('use-cloud').checked,
      model: document.getElementById('model-input').value.trim(),
      temperature: parseFloat(document.getElementById('temperature').value),
      maxTokens: parseInt(document.getElementById('max-tokens').value),
      systemPrompt: document.getElementById('system-prompt').value,
      replayDelay: parseInt(document.getElementById('replay-delay').value),
      maxIterations: parseInt(document.getElementById('max-iterations').value),
      autoRecord: document.getElementById('auto-record').checked
    };
    try {
      await bg('SAVE_SETTINGS', settings);
      showConnectionResult('✓ Ayarlar kaydedildi', true);
      updateModelBadge(settings.model);
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
    bg('OLLAMA_MODELS', {}).then(populateModels).catch(() => {});
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

  if (chunk.done) {
    chatHistory.push({ role: 'assistant', content: streamBuffer });
    streamBuffer = '';
    streamEl = null;
  }
}

function appendMessage(role, content) {
  const messages = document.getElementById('messages');
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;

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

function scrollMessages() {
  const el = document.getElementById('messages');
  el.scrollTop = el.scrollHeight;
}

// ---- Task (Autonomous Agent) ----
function setupTask() {
  document.getElementById('run-task-btn').addEventListener('click', runTask);
  document.getElementById('stop-task-btn').addEventListener('click', stopTask);
  document.getElementById('stop-task-btn-2').addEventListener('click', stopTask);
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

  if (running) {
    // Running state
    stopBtn.style.display = 'inline-flex';
    stopBtn2.style.display = 'inline-flex';
    statusEl.textContent = label || 'Çalışıyor...';
    status2El.textContent = label || 'Çalışıyor...';
    continueArea.style.display = 'none';
    runBtn.style.display = 'none';
  } else {
    // Idle state
    stopBtn.style.display = 'none';
    stopBtn2.style.display = 'none';
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
    await bgWithRetry('AGENT_RUN_TASK', {
      task: text,
      tabId: currentTabId,
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

function handleAgentEvent(data) {
  if (!data) return;
  switch (data.type) {
    case 'TASK_START':
      taskLog('info', '▶ Görev başlatıldı');
      break;
    case 'AGENT_THOUGHT':
      // Show a summary of thought (first 120 chars)
      if (data.content && !data.content.includes('<tool_call>')) {
        taskLog('thought', '💭 ' + data.content.substring(0, 120) + (data.content.length > 120 ? '...' : ''));
      }
      break;
    case 'TOOL_CALL':
      taskLog('tool', `🔧 ${data.tool}(${JSON.stringify(data.args).substring(0, 80)})`);
      break;
    case 'TOOL_RESULT':
      taskLog('result', `✓ ${data.tool}: ${JSON.stringify(data.result).substring(0, 80)}`);
      break;
    case 'TOOL_ERROR':
      taskLog('error', `✗ ${data.tool}: ${data.error}`);
      break;
    case 'TASK_COMPLETE':
      // Save messages for continuation, update UI
      if (data.messages) taskSessionMessages = data.messages;
      taskLog('final', '✓ Görev tamamlandı: ' + (data.result || '').substring(0, 120));
      setTaskRunning(false);
      showContinueArea(true);
      refreshHistory();
      break;
    case 'TASK_STOPPED':
      if (data.messages) taskSessionMessages = data.messages;
      taskLog('info', '⏹ Görev durduruldu');
      setTaskRunning(false);
      showContinueArea(false);
      refreshHistory();
      break;
    case 'TASK_ERROR':
      if (data.messages) taskSessionMessages = data.messages;
      taskLog('error', '✗ Görev hatası: ' + (data.error || 'Bilinmeyen hata'));
      setTaskRunning(false);
      showContinueArea(false);
      refreshHistory();
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

function taskLog(type, text) {
  const log = document.getElementById('task-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${text}`;
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

    item.innerHTML = `
      <div class="history-header">
        <div class="history-task">${escHtml(entry.task)}</div>
        ${statusChip}
      </div>
      <div class="history-result">${escHtml(preview)}</div>
      <div class="history-meta">${date}</div>
      <div class="history-actions">
        <button class="btn btn-secondary btn-sm" data-action="continue" data-id="${entry.id}">💬 Konuşmaya Devam Et</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${entry.id}">✕ Sil</button>
      </div>
    `;

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

function continueFromHistory(entry) {
  // Load the task's full message history into chat and switch to chat tab
  chatHistory = entry.messages || [];

  // Clear chat messages and rebuild from history
  const messagesEl = document.getElementById('messages');
  messagesEl.innerHTML = '';

  // Add a context header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'message assistant';
  headerDiv.innerHTML = `<div class="message-bubble" style="background:rgba(91,82,232,0.08);border-color:rgba(91,82,232,0.2);color:var(--accent);">
    🕓 <strong>Geçmiş görev:</strong> ${escHtml(entry.task)}<br>
    <span style="font-size:11px;color:var(--text3);">${new Date(entry.createdAt).toLocaleString('tr-TR')}</span>
  </div>`;
  messagesEl.appendChild(headerDiv);

  // Show the final result as an assistant message
  if (entry.result) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'message assistant';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = entry.result;
    resultDiv.appendChild(bubble);
    messagesEl.appendChild(resultDiv);
  }

  // Append a hint
  const hintDiv = document.createElement('div');
  hintDiv.className = 'message assistant';
  hintDiv.innerHTML = `<div class="message-bubble" style="font-size:11px;color:var(--text3);background:var(--bg3);border:none;box-shadow:none;">
    Bu görev hakkında soru sorabilir veya devam edebilirsin.
  </div>`;
  messagesEl.appendChild(hintDiv);

  scrollMessages();

  // Switch to chat tab
  document.querySelector('[data-tab="chat"]').click();
}

// ---- Helpers ----
function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
