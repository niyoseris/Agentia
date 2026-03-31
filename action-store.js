// ActionStore — persists recordings to chrome.storage.local

export class ActionStore {
  constructor() {
    this.recordings = {};   // id → full recording
    this.activeRecording = null;
  }

  async load() {
    const data = await chrome.storage.local.get('agentia_recordings');
    this.recordings = data.agentia_recordings || {};
  }

  async save() {
    await chrome.storage.local.set({ agentia_recordings: this.recordings });
  }

  setActiveRecording(recording) {
    this.activeRecording = recording;
  }

  addEvent(event) {
    if (!this.activeRecording) return;
    // Compute delay from previous event
    const events = this.activeRecording.events;
    const prev = events[events.length - 1];
    event.delay = prev ? event.timestamp - prev.timestamp : 0;
    events.push(event);
  }

  async saveRecording(recording) {
    this.recordings[recording.id] = recording;
    await this.save();
    this.activeRecording = null;
  }

  getRecordings() {
    return Object.values(this.recordings).map(r => ({
      id: r.id,
      name: r.name,
      startUrl: r.startUrl,
      eventCount: r.events?.length || 0,
      duration: r.duration,
      startTime: r.startTime
    })).sort((a, b) => b.startTime - a.startTime);
  }

  getRecording(id) {
    return this.recordings[id] || null;
  }

  async deleteRecording(id) {
    delete this.recordings[id];
    await this.save();
  }

  async renameRecording(id, name) {
    if (this.recordings[id]) {
      this.recordings[id].name = name;
      await this.save();
    }
  }
}
