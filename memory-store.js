// Agentia Memory Store — Persistent memory across sessions
// Stores preferences, learned facts, task summaries, and chat context

const STORAGE_KEY = 'agentia_memory';

export class MemoryStore {
  constructor() {
    this.data = null;
  }

  // ---- Load / Save ----
  async load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    this.data = stored[STORAGE_KEY] || {
      preferences: {},
      learned: [],
      taskMemory: [],
      chatMemory: [],
      recipes: []
    };
    // Migrate old data missing recipes
    if (!this.data.recipes) this.data.recipes = [];
    // Migrate old learned facts missing a category
    for (const l of this.data.learned) {
      if (!l.category) l.category = 'genel';
    }
  }

  async save() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.data });
  }

  // ---- Task Memory ----
  // Automatically saved after each task completion
  async addTaskMemory(task, summary, success) {
    if (!this.data) await this.load();
    this.data.taskMemory.unshift({
      id: `tm_${Date.now()}`,
      task: task.substring(0, 200),
      summary: summary.substring(0, 500),
      success: !!success,
      createdAt: Date.now()
    });
    // Keep last 20 task summaries
    if (this.data.taskMemory.length > 20) {
      this.data.taskMemory = this.data.taskMemory.slice(0, 20);
    }
    await this.save();
  }

  // ---- Chat Memory ----
  // Short summaries of past conversations
  async addChatMemory(summary, topics = []) {
    if (!this.data) await this.load();
    this.data.chatMemory.unshift({
      id: `cm_${Date.now()}`,
      summary: summary.substring(0, 300),
      topics: topics.slice(0, 5),
      createdAt: Date.now()
    });
    // Keep last 10 chat summaries
    if (this.data.chatMemory.length > 10) {
      this.data.chatMemory = this.data.chatMemory.slice(0, 10);
    }
    await this.save();
  }

  // ---- Learned Facts ----
  // General (site-agnostic) knowledge + tricks + preferences, categorized
  async addLearned(topic, info, category) {
    if (!this.data) await this.load();
    const cat = (category || 'genel').toString().substring(0, 40).toLowerCase().trim() || 'genel';

    // Avoid duplicates — update existing entry with same topic
    const existing = this.data.learned.findIndex(l => l.topic.toLowerCase() === topic.toLowerCase());
    if (existing >= 0) {
      this.data.learned[existing].info = info;
      this.data.learned[existing].category = cat;
      this.data.learned[existing].updatedAt = Date.now();
    } else {
      this.data.learned.unshift({
        id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        topic: topic.substring(0, 100),
        info: info.substring(0, 500),
        category: cat,
        createdAt: Date.now()
      });
    }

    // Keep last 60 learned facts
    if (this.data.learned.length > 60) {
      this.data.learned = this.data.learned.slice(0, 60);
    }
    await this.save();
  }

  // Distinct categories present in learned facts (for UI filtering)
  getLearnedCategories() {
    const cats = new Set();
    for (const l of (this.data?.learned || [])) cats.add(l.category || 'genel');
    return [...cats].sort();
  }

  // ---- Preferences ----
  async setPreference(key, value) {
    if (!this.data) await this.load();
    this.data.preferences[key] = value;
    await this.save();
  }

  getPreference(key) {
    return this.data?.preferences?.[key];
  }

  // ---- Deletion ----
  async deleteLearned(id) {
    if (!this.data) await this.load();
    this.data.learned = this.data.learned.filter(l => l.id !== id);
    await this.save();
  }

  async deleteTaskMemory(id) {
    if (!this.data) await this.load();
    this.data.taskMemory = this.data.taskMemory.filter(t => t.id !== id);
    await this.save();
  }

  async deleteRecipe(id) {
    if (!this.data) await this.load();
    this.data.recipes = this.data.recipes.filter(r => r.id !== id);
    await this.save();
  }

  // ---- Site Recipes ----
  // Structured action sequences for specific sites (e.g., "how to post on Bluesky")
  async addRecipe(site, task, steps) {
    if (!this.data) await this.load();
    if (!this.data.recipes) this.data.recipes = []; // Migrate old data

    // Update existing recipe for same site+task
    const existing = this.data.recipes.findIndex(
      r => r.site.toLowerCase() === site.toLowerCase() && r.task.toLowerCase() === task.toLowerCase()
    );
    if (existing >= 0) {
      this.data.recipes[existing].steps = steps;
      this.data.recipes[existing].updatedAt = Date.now();
      this.data.recipes[existing].useCount = (this.data.recipes[existing].useCount || 0) + 1;
    } else {
      this.data.recipes.unshift({
        id: `recipe_${Date.now()}`,
        site: site.substring(0, 100),
        task: task.substring(0, 100),
        steps,
        createdAt: Date.now(),
        useCount: 0
      });
    }

    // Keep last 20 recipes
    if (this.data.recipes.length > 20) {
      this.data.recipes = this.data.recipes.slice(0, 20);
    }
    await this.save();
  }

  // Find matching recipes for a task description (kept for API use, not used in prompt)
  findMatchingRecipes(taskDescription) {
    if (!this.data?.recipes?.length || !taskDescription) return [];
    const taskLower = taskDescription.toLowerCase();
    return this.data.recipes.filter(r => {
      const siteLower = r.site.toLowerCase();
      return taskLower.includes(siteLower) || taskLower.includes(siteLower.replace('.', ''));
    }).slice(0, 3);
  }

  async clear() {
    this.data = {
      preferences: {},
      learned: [],
      taskMemory: [],
      chatMemory: [],
      recipes: []
    };
    await this.save();
  }

  // ---- Build Memory Context for System Prompt ----
  // Returns a formatted string with relevant memories, limited to ~2000 chars
  buildMemoryPrompt(currentTask = '') {
    if (!this.data) return '';

    const parts = [];
    let totalChars = 0;
    const MAX_CHARS = 2000;

    // 1. Preferences (always included, usually short)
    const prefs = this.data.preferences;
    if (Object.keys(prefs).length > 0) {
      const prefLines = Object.entries(prefs)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');
      parts.push(`## User Preferences\n${prefLines}`);
      totalChars += prefLines.length;
    }

    // 2. Learned facts relevant to current task
    const taskKeywords = extractKeywords(currentTask);
    const relevantLearned = this.data.learned.filter(l => {
      if (!currentTask) return true; // No task = show all
      const infoKeywords = extractKeywords(l.topic + ' ' + l.info);
      return taskKeywords.some(k => infoKeywords.includes(k));
    }).slice(0, 15);

    // 2.5 Site Recipes — show all available recipes, LLM decides which is relevant
    const recipes = this.data.recipes || [];
    if (recipes.length > 0) {
      const recipeText = recipes.slice(0, 5).map(r => {
        const stepsText = r.steps.map((s, i) => `  ${i + 1}. ${s.action}: ${s.selector}${s.value ? ` → "${s.value}"` : ''}${s.note ? ` (${s.note})` : ''}`).join('\n');
        return `### ${r.site} — ${r.task}\n${stepsText}`;
      }).join('\n\n');
      const section = `## Learned Site Workflows (if current task matches any of these, follow the steps instead of exploring)\n${recipeText}`;
      if (totalChars + section.length <= MAX_CHARS + 2000) { // Extra budget for recipes
        parts.push(section);
        totalChars += section.length;
      }
    }

    if (relevantLearned.length > 0) {
      // Group by category so related knowledge stays together
      const byCategory = {};
      for (const l of relevantLearned) {
        const cat = l.category || 'genel';
        (byCategory[cat] = byCategory[cat] || []).push(l);
      }
      const catBlocks = Object.entries(byCategory)
        .map(([cat, facts]) => `### ${cat}\n` + facts.map(l => `- [${l.topic}] ${l.info}`).join('\n'))
        .join('\n');
      const section = `## Öğrenilen Bilgiler (geçmiş görevlerden)\n${catBlocks}`;
      if (totalChars + section.length <= MAX_CHARS) {
        parts.push(section);
        totalChars += section.length;
      }
    }

    // 3. Recent task summaries (relevant to current task)
    const relevantTasks = currentTask
      ? this.data.taskMemory.filter(t => {
          const taskKw = extractKeywords(t.task);
          return taskKeywords.some(k => taskKw.includes(k));
        }).slice(0, 5)
      : this.data.taskMemory.slice(0, 5);

    if (relevantTasks.length > 0) {
      const taskText = relevantTasks
        .map(t => `- ${t.success ? '✓' : '✗'} ${t.task}: ${t.summary}`)
        .join('\n');
      const section = `## Past Tasks\n${taskText}`;
      if (totalChars + section.length <= MAX_CHARS) {
        parts.push(section);
        totalChars += section.length;
      }
    }

    // 4. Recent chat context (last 3)
    const recentChats = this.data.chatMemory.slice(0, 3);
    if (recentChats.length > 0) {
      const chatText = recentChats
        .map(c => `- ${c.summary}`)
        .join('\n');
      const section = `## Recent Conversations\n${chatText}`;
      if (totalChars + section.length <= MAX_CHARS) {
        parts.push(section);
        totalChars += section.length;
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  // ---- Get all memory (for UI display) ----
  getAll() {
    return this.data || {
      preferences: {},
      learned: [],
      taskMemory: [],
      chatMemory: [],
      recipes: []
    };
  }
}

// ---- Keyword extraction for relevance matching ----
// Exported for reuse by rag.js keyword-fallback scoring
export function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every',
    'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
    'about', 'bu', 've', 'da', 'de', 'için', 'ile', 'bir', 'bu', 'şu',
    'ne', 'nasıl', 'neden', 'kim', 'hangi', 'kaç', 'her', 'tüm', 'bazı'
  ]);
  return text.toLowerCase()
    .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);
}