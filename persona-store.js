// Agentia Persona Store — profile bundles: personality prompt + linked KBs + skills + model overrides
// Stored in chrome.storage.local (small JSON, same pattern as MemoryStore)

const STORAGE_KEY = 'agentia_personas';
const DEFAULT_ID = 'default';

export class PersonaStore {
  constructor() {
    this.data = null;
  }

  async load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    this.data = stored[STORAGE_KEY] || { activePersonaId: DEFAULT_ID, personas: [] };
    if (!Array.isArray(this.data.personas)) this.data.personas = [];
    if (!this.data.activePersonaId) this.data.activePersonaId = DEFAULT_ID;
  }

  async save() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.data });
  }

  // Creates the built-in "Agentia" persona (current default behavior) if missing
  async ensureDefault() {
    if (!this.data) await this.load();
    if (!this.data.personas.some(p => p.id === DEFAULT_ID)) {
      this.data.personas.unshift({
        id: DEFAULT_ID,
        name: 'Agentia',
        emoji: '🤖',
        personalityPrompt: '',
        kbIds: [],
        skillIds: [],
        modelOverride: '',
        temperatureOverride: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      await this.save();
    }
  }

  list() {
    return this.data?.personas || [];
  }

  get(id) {
    return this.data?.personas.find(p => p.id === id) || null;
  }

  getActive() {
    return this.get(this.data?.activePersonaId) || this.get(DEFAULT_ID);
  }

  async setActive(id) {
    if (!this.data) await this.load();
    if (!this.get(id)) throw new Error(`Persona bulunamadı: ${id}`);
    this.data.activePersonaId = id;
    await this.save();
    return this.get(id);
  }

  async upsert(persona) {
    if (!this.data) await this.load();
    const clean = {
      name: (persona.name || 'Adsız').substring(0, 60),
      emoji: (persona.emoji || '🎭').substring(0, 8),
      personalityPrompt: (persona.personalityPrompt || '').substring(0, 4000),
      kbIds: Array.isArray(persona.kbIds) ? persona.kbIds : [],
      skillIds: Array.isArray(persona.skillIds) ? persona.skillIds : [],
      modelOverride: (persona.modelOverride || '').trim(),
      temperatureOverride: normalizeTemperature(persona.temperatureOverride),
      updatedAt: Date.now()
    };

    const existing = persona.id ? this.data.personas.findIndex(p => p.id === persona.id) : -1;
    if (existing >= 0) {
      // The default persona keeps its identity fields
      if (persona.id === DEFAULT_ID) {
        clean.name = 'Agentia';
        clean.emoji = this.data.personas[existing].emoji || '🤖';
      }
      this.data.personas[existing] = { ...this.data.personas[existing], ...clean };
      await this.save();
      return this.data.personas[existing];
    }

    const created = {
      id: `persona_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...clean,
      createdAt: Date.now()
    };
    this.data.personas.push(created);
    await this.save();
    return created;
  }

  // Deleting the active persona falls back to the default; default is undeletable
  async delete(id) {
    if (!this.data) await this.load();
    if (id === DEFAULT_ID) throw new Error('Varsayılan persona silinemez');
    this.data.personas = this.data.personas.filter(p => p.id !== id);
    if (this.data.activePersonaId === id) this.data.activePersonaId = DEFAULT_ID;
    await this.save();
  }
}

function normalizeTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.min(2, Math.max(0, n));
}

// Singleton export for shared use
export const personaStore = new PersonaStore();
