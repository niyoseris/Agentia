// Recording and replay handler

import { handleDomAction } from './dom-handler.js';
import { waitForTabLoad, getActiveTabId } from './utils.js';

let activeRecording = null;

export function getActiveRecording() {
  return activeRecording;
}

export function setActiveRecording(recording) {
  activeRecording = recording;
}

export async function startRecording(tabId, name, actionStore) {
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

  // Persist recording state for service worker restarts
  await chrome.storage.session.set({ agentia_active_recording: activeRecording });

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { window.__agentiaRecording = true; }
  });

  chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING', recordingId }).catch((e) => { console.warn('[Agentia] Start recording notification failed:', e.message); });
  actionStore.setActiveRecording(activeRecording);

  chrome.runtime.sendMessage({ type: 'RECORDING_STATUS', status: 'started', recordingId }).catch((e) => { console.warn('[Agentia] Recording status notification failed:', e.message); });
  return recordingId;
}

export async function stopRecording(tabId, actionStore) {
  if (!activeRecording) return null;

  chrome.tabs.sendMessage(tabId || activeRecording.tabId, { type: 'STOP_RECORDING' }).catch((e) => { console.warn('[Agentia] Stop recording notification failed:', e.message); });

  const recording = { ...activeRecording };
  recording.endTime = Date.now();
  recording.duration = recording.endTime - recording.startTime;

  await actionStore.saveRecording(recording);
  activeRecording = null;

  // Clear persisted recording state
  await chrome.storage.session.remove('agentia_active_recording');

  chrome.runtime.sendMessage({ type: 'RECORDING_STATUS', status: 'stopped', recording }).catch((e) => { console.warn('[Agentia] Recording status notification failed:', e.message); });
  return recording;
}

export function toggleRecording(tab) {
  if (activeRecording) {
    return stopRecording(tab.id);
  } else {
    return startRecording(tab.id, null);
  }
}

export async function replayRecording(recordingId, tabId, adaptive, agentCore, actionStore) {
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

  return replayEvents(recording.events, targetTabId);
}

// Replay a bare event list (used by replayRecording and macro skills)
export async function replayEvents(events, tabId) {
  const results = [];
  for (const event of events) {
    try {
      const result = await executeRecordedEvent(event, tabId);
      results.push({ event, result, success: true });
      await new Promise(r => setTimeout(r, event.delay || 500));
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
      return await chrome.tabs.create({ url: event.url });

    case 'tab_close':
      return await chrome.tabs.remove(event.tabId);

    default:
      return { skipped: event.type };
  }
}