// Settings handler

const DEFAULT_SETTINGS = {
  ollamaUrl: 'http://localhost:11434',
  useCloud: true,
  apiKey: '',
  model: 'llama3.2',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '',
  autoRecord: false,
  replayDelay: 500,
  maxIterations: 0,
  thinkingMode: 'off',
  visionEnabled: 'auto',   // 'auto' = detect, 'on' = force on, 'off' = force off
  modelHistory: []
};

export function addModelToHistory(settings, model) {
  const m = (model || '').trim();
  if (!m) return settings;
  const history = Array.isArray(settings.modelHistory) ? settings.modelHistory : [];
  const filtered = history.filter(item => item !== m);
  const next = [m, ...filtered];
  if (next.length > 20) next.length = 20;
  return { ...settings, modelHistory: next };
}

export async function getSettings() {
  const data = await chrome.storage.local.get('agentia_settings');
  return data.agentia_settings || DEFAULT_SETTINGS;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ agentia_settings: settings });
}