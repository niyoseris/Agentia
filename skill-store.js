// Agentia Skill Store — user-defined agent capabilities
// Two kinds: 'prompt' skills (instruction packs, loaded on demand via skill_use)
// and 'macro' skills (recorded action sequences, executed via skill_run_macro).
// Stored in chrome.storage.local (small JSON, same pattern as MemoryStore).

const STORAGE_KEY = 'agentia_skills';

export class SkillStore {
  constructor() {
    this.data = null;
  }

  async load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    this.data = stored[STORAGE_KEY] || { skills: [] };
    if (!Array.isArray(this.data.skills)) this.data.skills = [];
  }

  async save() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.data });
  }

  list() {
    return this.data?.skills || [];
  }

  get(id) {
    return this.data?.skills.find(s => s.id === id) || null;
  }

  getByName(name) {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    return this.data?.skills.find(s => s.name.toLowerCase() === lower) || null;
  }

  // Skills visible to the agent: globally enabled ones plus the persona's linked ones
  effectiveSkills(persona) {
    const skills = this.list();
    const linkedIds = new Set(persona?.skillIds || []);
    return skills.filter(s => s.enabled || linkedIds.has(s.id));
  }

  async upsert(skill) {
    if (!this.data) await this.load();
    const name = (skill.name || '').trim().substring(0, 60);
    if (!name) throw new Error('Skill adı gerekli');

    // Names must be unique — the agent invokes skills by name
    const clash = this.getByName(name);
    if (clash && clash.id !== skill.id) throw new Error(`Bu adla bir skill zaten var: ${name}`);

    const clean = {
      type: skill.type === 'macro' ? 'macro' : 'prompt',
      name,
      description: (skill.description || '').substring(0, 300),
      enabled: skill.enabled !== false,
      instructions: (skill.instructions || '').substring(0, 8000),
      steps: Array.isArray(skill.steps) ? skill.steps.slice(0, 50).map(cleanStep) : [],
      sourceRecordingId: skill.sourceRecordingId || null,
      updatedAt: Date.now()
    };

    const existing = skill.id ? this.data.skills.findIndex(s => s.id === skill.id) : -1;
    if (existing >= 0) {
      this.data.skills[existing] = { ...this.data.skills[existing], ...clean };
      await this.save();
      return this.data.skills[existing];
    }

    const created = {
      id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...clean,
      createdAt: Date.now()
    };
    this.data.skills.push(created);
    await this.save();
    return created;
  }

  async delete(id) {
    if (!this.data) await this.load();
    this.data.skills = this.data.skills.filter(s => s.id !== id);
    await this.save();
  }

  async setEnabled(id, enabled) {
    if (!this.data) await this.load();
    const skill = this.get(id);
    if (!skill) throw new Error(`Skill bulunamadı: ${id}`);
    skill.enabled = !!enabled;
    skill.updatedAt = Date.now();
    await this.save();
    return skill;
  }

  // Create a macro skill from an existing recording's events
  async fromRecording(recording, { name, description }) {
    if (!recording?.events?.length) throw new Error('Kayıtta olay yok');
    const steps = recording.events.map(e => ({
      action: e.type,
      selector: e.selector || '',
      value: e.value || e.url || e.key || '',
      note: ''
    }));
    return this.upsert({
      type: 'macro',
      name: name || recording.name || 'Kayıt makrosu',
      description: description || `${recording.name || 'Kayıt'} — ${steps.length} adım`,
      enabled: true,
      steps,
      sourceRecordingId: recording.id
    });
  }
}

function cleanStep(step) {
  return {
    action: (step.action || '').substring(0, 30),
    selector: (step.selector || '').substring(0, 300),
    value: (step.value || '').substring(0, 500),
    note: (step.note || '').substring(0, 200)
  };
}

// Singleton export for shared use
export const skillStore = new SkillStore();
