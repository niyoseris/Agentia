// Agentia Popup

const bg = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res?.success === false) return reject(new Error(res.error));
      resolve(res?.data);
    });
  });

let isRecording = false;
let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get active tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  document.getElementById('url-row').textContent = tab?.url || '—';
  document.getElementById('url-row').title = tab?.url || '';

  // Load settings for model display
  try {
    const settings = await bg('GET_SETTINGS', {});
    document.getElementById('model-chip').textContent = settings.model
      ? settings.model.split(':')[0]
      : '—';
  } catch {}

  // Check Ollama connection
  try {
    await bg('OLLAMA_MODELS', {});
    document.getElementById('status-dot').className = 'status-dot on';
  } catch {
    document.getElementById('status-dot').className = 'status-dot err';
  }

  // Load last recording name
  try {
    const recordings = await bg('GET_RECORDINGS', {});
    if (recordings?.length > 0) {
      const last = recordings[0];
      const el = document.getElementById('last-rec');
      el.textContent = `Son kayıt: ${last.name} (${last.eventCount} eylem)`;
      el.classList.add('visible');
    }
  } catch {}

  // Panel button
  document.getElementById('panel-btn').addEventListener('click', () => {
    chrome.sidePanel.open({ tabId: currentTabId });
    window.close();
  });

  // Record toggle
  document.getElementById('rec-btn').addEventListener('click', async () => {
    const btn = document.getElementById('rec-btn');
    if (!isRecording) {
      try {
        await bg('RECORDING_START', { tabId: currentTabId });
        isRecording = true;
        btn.textContent = '⏹ Kaydı Durdur';
        btn.classList.add('active');
      } catch (err) {
        alert('Kayıt başlatılamadı: ' + err.message);
      }
    } else {
      try {
        const recording = await bg('RECORDING_STOP', { tabId: currentTabId });
        isRecording = false;
        btn.textContent = '⏺ Kayıt Başlat';
        btn.classList.remove('active');
        if (recording) {
          const el = document.getElementById('last-rec');
          el.textContent = `Kaydedildi: ${recording.name} (${recording.events?.length || 0} eylem)`;
          el.classList.add('visible');
        }
      } catch (err) {
        alert('Kayıt durdurulamadı: ' + err.message);
      }
    }
  });
});
