// Task history handler

export async function getTaskHistory() {
  const data = await chrome.storage.local.get('agentia_task_history');
  return data.agentia_task_history || [];
}

export async function saveTaskHistory(entry) {
  const history = await getTaskHistory();
  history.unshift({
    id: `task_${Date.now()}`,
    task: entry.task,
    result: entry.result,
    log: entry.log || [],
    messages: entry.messages || [],
    reportFileKey: entry.reportFileKey || null,
    createdAt: Date.now(),
    success: entry.success ?? true
  });
  if (history.length > 50) history.splice(50);
  await chrome.storage.local.set({ agentia_task_history: history });
}

export async function deleteTaskHistory(id) {
  const history = await getTaskHistory();
  const filtered = history.filter(h => h.id !== id);
  await chrome.storage.local.set({ agentia_task_history: filtered });
}