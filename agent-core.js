// AgentCore — Ollama local + cloud, native tool calling, adaptive replay

import { AGENT_TOOLS } from './tools.js';
import { AGENT_SYSTEM_PROMPT_BASE, buildSystemPrompt } from './prompts.js';
export class AgentCore {
  constructor(ollamaBase) {
    this.localBase = ollamaBase || 'http://localhost:11434';
    this.cloudBase = 'https://ollama.com';
    this.model = 'llama3.2';
    this.temperature = 0.7;
    this.maxTokens = 4096;
    this.systemPrompt = '';
    this.apiKey = '';          // For cloud auth
    this.useCloud = false;     // Toggle local vs cloud
    this.maxToolIterations = 0; // 0 = no limit, user stops manually via STOP_TASK
    this.thinkingMode = 'off'; // 'off', 'low', 'medium', 'high'
    this.visionEnabled = 'auto'; // 'auto', 'on', 'off'
    this.memoryStore = null; // Set by background.js after init
    this._visionCache = null; // Cache for model vision capability check
  }

  // Build memory context string for system prompt injection
  _buildMemoryPrompt(taskDescription) {
    if (!this.memoryStore) return '';
    const context = this.memoryStore.buildMemoryPrompt(taskDescription || '');
    return context ? '\n\n## Your Memories (from past sessions)\n' + context : '';
  }

  updateSettings(settings) {
    if (settings.ollamaUrl) this.localBase = settings.ollamaUrl;
    if (settings.cloudBase) this.cloudBase = settings.cloudBase;
    if (settings.model) this.model = settings.model;
    if (settings.temperature !== undefined) this.temperature = settings.temperature;
    if (settings.maxTokens) this.maxTokens = settings.maxTokens;
    if (settings.systemPrompt !== undefined) this.systemPrompt = settings.systemPrompt;
    if (settings.apiKey !== undefined) this.apiKey = settings.apiKey;
    if (settings.useCloud !== undefined) this.useCloud = settings.useCloud;
    if (settings.maxIterations !== undefined && settings.maxIterations !== null) this.maxToolIterations = settings.maxIterations;
    if (settings.thinkingMode !== undefined) this.thinkingMode = settings.thinkingMode;
    if (settings.visionEnabled !== undefined) {
      this.visionEnabled = settings.visionEnabled;
      this._visionCache = null; // Reset cache when setting changes
    }
  }

  // Resolved API base (local or cloud)
  get apiBase() {
    return this.useCloud ? this.cloudBase : this.localBase;
  }

  // Build fetch headers — adds auth only for cloud
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.useCloud && this.apiKey) {
      h['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  // Detect if current model supports vision/multimodal input
  // Async version — checks Ollama API then caches result
  async _checkVisionCapability() {
    // Manual override takes priority
    if (this.visionEnabled === 'on') { this._visionCache = true; return; }
    if (this.visionEnabled === 'off') { this._visionCache = false; return; }

    let result = false;

    // 1. Try Ollama API — /api/show returns model capabilities
    try {
      const res = await fetch(`${this.apiBase}/api/show`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ name: this.model })
      });
      if (res.ok) {
        const data = await res.json();
        const info = JSON.stringify(data).toLowerCase();
        if (info.includes('vision') || info.includes('clip') || info.includes('image') || info.includes('multimodal')) {
          result = true;
        }
        if (data.projector_architecture) result = true;
      }
    } catch {}

    // 2. Fallback: heuristic model name check
    if (!result) {
      result = this._isVisionByModelName();
    }

    this._visionCache = result;
  }

  // Synchronous heuristic check — used when API check isn't available yet
  _isVisionByModelName() {
    const name = this.model.toLowerCase();
    const visionFamilies = ['llava', 'bakllava', 'pixtral', 'minicpm-v', 'internvl', 'cogvlm', 'moondream'];
    const visionModels = [
      'llama4', 'llama-4',
      'llama3.2-vision', 'llama-3.2-vision',
      'gemma3', 'gemma4', 'gemma-3', 'gemma-4',
      'qwen2.5-vl', 'qwen2-vl', 'qwen2.5vl',
      'phi-3.5-vision', 'phi3.5-vision',
      'mistral-small3',
    ];
    if (visionModels.some(m => name.includes(m))) return true;
    if (visionFamilies.some(f => name.includes(f))) return true;
    if (name.includes('vision') || name.includes('-vl') || name.includes('mm')) return true;
    return false;
  }

  // Synchronous vision check — uses cached result from _checkVisionCapability
  _isVisionModel() {
    if (this.visionEnabled === 'on') return true;
    if (this.visionEnabled === 'off') return false;
    if (this._visionCache !== null) return this._visionCache;
    // No cache yet — fall back to name heuristic
    return this._isVisionByModelName();
  }

  // Compress screenshot: resize to max 768px wide, JPEG quality 50
  // Uses OffscreenCanvas (available in Chrome 99+ service workers)
  async _compressScreenshot(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return null;

    const MAX_WIDTH = 768;
    const JPEG_QUALITY = 0.5;

    try {
      // Decode the data URL into an ImageBitmap
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const origW = bitmap.width;
      const origH = bitmap.height;

      // Calculate resize dimensions
      let targetW = origW;
      let targetH = origH;
      if (origW > MAX_WIDTH) {
        targetW = MAX_WIDTH;
        targetH = Math.round(origH * (MAX_WIDTH / origW));
      }

      // Resize and re-encode as JPEG
      const canvas = new OffscreenCanvas(targetW, targetH);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close();

      const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });

      // Convert blob to base64
      const buffer = await jpegBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      // Safety: reject if still too large (> 800KB base64 = ~600KB image)
      if (base64.length > 800000) {
        console.warn(`[Agentia] Screenshot still too large after compression: ${Math.round(base64.length / 1024)}KB, skipping`);
        return null;
      }

      return base64;
    } catch (err) {
      console.warn('[Agentia] Screenshot compression failed:', err.message);
      // Fallback: strip prefix and return raw — may be too large
      const raw = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      return raw.length > 800000 ? null : raw;
    }
  }

  // Build Ollama API options including thinking/reasoning settings
  _buildOptions(extraOpts = {}) {
    const opts = {
      temperature: extraOpts.temperature ?? this.temperature,
      num_predict: extraOpts.num_predict ?? this.maxTokens
    };

    // Thinking mode: controls reasoning effort
    // 'off' = no thinking (default, fastest) — explicitly disable
    // 'low'/'medium'/'high' = enables thinking with increasing budget
    if (this.thinkingMode && this.thinkingMode !== 'off') {
      const thinkBudgets = { low: 1024, medium: 4096, high: 16384 };
      opts.think = true;
      opts.num_ctx = thinkBudgets[this.thinkingMode] || 4096;
    } else {
      // Explicitly disable thinking — some reasoning models think by default
      opts.think = false;
    }

    return opts;
  }

  // ---- Fetch with retry for transient errors (503, 429, network) ----
  // signal: optional AbortSignal to cancel in-flight requests immediately
  async _fetchWithRetry(url, options, maxRetries = 3, signal = null) {
    // If caller provided a signal, merge it into options so fetch can be aborted
    const fetchOpts = signal ? { ...options, signal } : options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // If signal was already aborted before this attempt, stop immediately
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      try {
        const res = await fetch(url, fetchOpts);
        // 403 from local Ollama = CORS/origin issue — provide clear guidance
        if (res.status === 403 && !this.useCloud) {
          throw new Error(
            'Ollama 403 Forbidden hatası. Çözüm: Terminalde şu komutla Ollama\'yı yeniden başlatın:\n' +
            '  OLLAMA_ORIGINS="*" ollama serve\n' +
            'veya environment variable olarak:\n' +
            '  export OLLAMA_ORIGINS="*"\n' +
            'Bu, Chrome extension\'ın Ollama\'ya erişmesine izin verir.'
          );
        }
        if (res.status === 500 || res.status === 503 || res.status === 429 || res.status === 502) {
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            this._notify({ type: 'AGENT_THOUGHT', content: `⏳ Sunucu geçici hatası (${res.status}), ${delay / 1000}s sonra tekrar deneniyor (${attempt}/${maxRetries})...` });
            await this._sleepWithSignal(delay, signal);
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            continue;
          }
        }
        return res;
      } catch (err) {
        // AbortError — rethrow immediately, no retry
        if (err.name === 'AbortError') throw err;
        // Network errors (ECONNREFUSED, timeout, etc.) — also retry
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          this._notify({ type: 'AGENT_THOUGHT', content: `⏳ Bağlantı hatası, ${delay / 1000}s sonra tekrar deneniyor (${attempt}/${maxRetries})...` });
          await this._sleepWithSignal(delay, signal);
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          continue;
        }
        throw err;
      }
    }
    // Should not reach here, but just in case
    return fetch(url, fetchOpts);
  }

  // Sleep that short-circuits when the signal is aborted
  async _sleepWithSignal(ms, signal) {
    if (!signal) {
      await new Promise(r => setTimeout(r, ms));
      return;
    }
    let timer, abortHandler;
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(resolve, ms);
        abortHandler = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        signal.addEventListener('abort', abortHandler, { once: true });
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
    // Timeout won: clean up abort listener
    if (abortHandler) signal.removeEventListener('abort', abortHandler);
  }

  // ---- Plain Chat (no tools) ----
  async chat(messages, tabId) {
    const allMessages = this._withSystem(messages);

    const res = await this._fetchWithRetry(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: false,
        options: this._buildOptions()
      })
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status} [${this.apiBase} → ${this.model}]: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content || '';
  }

  // ---- Streaming Chat (no tools) ----
  async streamChat(messages, tabId, onChunk) {
    const allMessages = this._withSystem(messages);

    const res = await this._fetchWithRetry(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: true,
        options: this._buildOptions()
      })
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status} [${this.apiBase} → ${this.model}]: ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const token = data.message?.content || '';
          // Thinking/reasoning content — only forward if thinking mode is enabled
          const thinking = (this.thinkingMode && this.thinkingMode !== 'off') ? (data.message?.thinking || '') : '';
          if (thinking) {
            onChunk({ token: '', thinking, done: false });
          }
          if (token) {
            fullContent += token;
            onChunk({ token, done: false });
          }
          if (data.done) {
            onChunk({ token: '', done: true, fullContent });
          }
        } catch {}
      }
    }

    return fullContent;
  }

  // ---- Autonomous Task with Native Tool Calling ----
  // existingMessages: pass prior conversation to continue from where it left off
  // signal: AbortController signal — abort() stops the loop between iterations
  async runTask(taskDescription, tabId, existingMessages = null, signal = null) {
    let messages;

    // Inject current date/time into system prompt
    const systemPrompt = buildSystemPrompt(
      AGENT_SYSTEM_PROMPT_BASE,
      this.systemPrompt,
      this._buildMemoryPrompt(taskDescription)
    );

    if (existingMessages && existingMessages.length > 0) {
      // Continue existing session — append new user turn
      messages = [...existingMessages, { role: 'user', content: taskDescription }];
    } else {
      messages = [
        { role: 'system', content: systemPrompt + (this.systemPrompt ? '\n\n' + this.systemPrompt : '') },
        { role: 'user', content: taskDescription }
      ];
    }

    const log = [];
    let iterations = 0;
    let consecutiveDomFailures = 0;  // stuck detection counter
    let pendingScreenshot = null;     // base64 image from last tab_screenshot (sent to vision models)

    // File tracking — ensure file_open is always called when a file was created
    let activeFileKey = null;   // fileKey from the most recent file_create call
    let fileUpdateCount = 0;    // how many file_update calls have been made
    let fileOpened = false;     // whether file_open was called
    let currentPageUrl = '';    // track current page for research buffer

    // Research buffer — raw text snippets collected during browsing
    // Used to build the final HTML if the model never called file_update
    const researchBuffer = [];

    // ── Restore file tracking and research buffer from prior session ──────
    // When continuing a task, scan existingMessages to recover state that
    // would otherwise be lost (activeFileKey, researchBuffer entries, etc.)
    if (existingMessages && existingMessages.length > 0) {
      let restoredUrl = '';
      // Build a map of tool call names from assistant messages to match
      // with tool result messages that may lack a name field (older format)
      const toolCallNames = [];  // ordered list of tool names from assistant messages
      for (const msg of existingMessages) {
        if (msg.role === 'assistant' && msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            if (tc.function?.name) toolCallNames.push(tc.function.name);
          }
        }
      }
      let toolCallIdx = 0;
      for (const msg of existingMessages) {
        // Recover current page URL from navigate/create tool calls
        if (msg.role === 'tool') {
          // Get tool name: prefer msg.name, fall back to ordered tool_calls list
          let toolName = msg.name || null;
          if (!toolName && toolCallIdx < toolCallNames.length) {
            toolName = toolCallNames[toolCallIdx];
          }
          if (msg.name || msg.content) toolCallIdx++;  // advance past this tool result

          if (!toolName) continue;

          let parsed = null;
          try {
            parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          } catch { parsed = null; }

          if ((toolName === 'tab_navigate' || toolName === 'tab_create') && parsed) {
            if (parsed?.url) restoredUrl = parsed.url;
          }
          // Rebuild researchBuffer from tool results in message history
          if (['dom_get_text', 'dom_extract', 'dom_query_all', 'dom_get_summary', 'page_get_info', 'pdf_read', 'web_search'].includes(toolName) && parsed) {
            let snippet = '';
            if (parsed.text) snippet = parsed.text;
            else if (parsed.content) snippet = parsed.content;
            else if (parsed.results) snippet = parsed.results.map(r => `[${r.title}](${r.url}) ${r.snippet}`).join('\n');
            else if (parsed.elements) snippet = parsed.elements.map(e => [e.text, e.href].filter(Boolean).join(' ')).join('\n');
            else if (parsed.pages) snippet = parsed.pages.map(p => `[Page ${p.page}] ${p.text}`).join('\n');
            else if (parsed.url) snippet = `[${parsed.title}](${parsed.url})`;
            if (snippet.length > 40) {
              researchBuffer.push({ url: restoredUrl, text: snippet.slice(0, 3000) });
            }
          }
          // Recover file tracking state
          if (toolName === 'file_create' && parsed) {
            if (parsed?.fileKey) {
              activeFileKey = parsed.fileKey;
              fileUpdateCount = 0;
              fileOpened = false;
            }
          } else if (toolName === 'file_update') {
            fileUpdateCount++;
          } else if (toolName === 'file_open') {
            fileOpened = true;
          } else if (toolName === 'create_file' && parsed) {
            if (parsed?.fileKey) {
              activeFileKey = parsed.fileKey;
              fileOpened = true;
            }
          }
        }
      }
    }

    this._notify({ type: 'TASK_START', task: taskDescription });

    // Pre-check vision capability via Ollama API (async) — caches result for sync use
    await this._checkVisionCapability();

    while (!this.maxToolIterations || iterations < this.maxToolIterations) {
      // Check abort signal before each LLM call
      if (signal?.aborted) {
        this._notify({ type: 'TASK_STOPPED', messages });
        this._bgMsg('SAVE_TASK_HISTORY', {
          task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
          log, messages, success: false
        }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
        return { success: false, error: 'Durduruldu', log, messages };
      }

      // ── Auto-checkpoint: force file_update from researchBuffer ────────────
      // Every 6 iterations: if file was created but NEVER updated, auto-write
      // partial content from researchBuffer WITHOUT asking the LLM.
      // (Reminders don't work — LLM says "OK" but never calls file_update)
      if (activeFileKey && !fileOpened && iterations > 0 && iterations % 6 === 0 && fileUpdateCount === 0 && researchBuffer.length >= 1) {
        this._notify({ type: 'AGENT_THOUGHT', content: `📄 Auto-checkpoint: ${researchBuffer.length} kaynak bulundu, dosyaya yazılıyor...` });
        try {
          const partialHtml = await this._buildFinalHtml(taskDescription, '', researchBuffer, signal);
          if (partialHtml) {
            await this._bgMsg('FILE_UPDATE', { fileKey: activeFileKey, content: partialHtml });
            fileUpdateCount++;
            this._notify({ type: 'TOOL_CALL', tool: 'file_update', args: { fileKey: activeFileKey } });
            this._notify({ type: 'TOOL_RESULT', tool: 'file_update', result: { fileKey: activeFileKey, updated: true, auto: true } });
            messages.push({ role: 'user', content: `[AUTO-CHECKPOINT] Your research so far has been saved to the file (fileKey: "${activeFileKey}"). Continue researching more sources. Call file_update again with updated content after each major finding. Call file_open when fully done.` });
          }
        } catch (e) {
          this._notify({ type: 'AGENT_THOUGHT', content: `Auto-checkpoint hatası: ${e.message}` });
        }
      }
      // If file was updated but file_open still missing, remind every 6 iters
      if (activeFileKey && !fileOpened && iterations > 0 && iterations % 6 === 0 && fileUpdateCount > 0) {
        messages.push({ role: 'user', content: `[REMINDER] Research is in progress. When you have collected enough data, call file_open("${activeFileKey}") to finish.` });
      }

      iterations++;

      // ── Inject screenshot into last user/tool message for vision models ──────
      let visionMessages = messages;
      if (pendingScreenshot && this._isVisionModel()) {
        visionMessages = messages.map((m, i) => {
          if (i === messages.length - 1 && (m.role === 'user' || m.role === 'tool')) {
            return { ...m, images: [pendingScreenshot] };
          }
          return m;
        });
        pendingScreenshot = null;
      }

      let data, assistantMsg;
      try {
        const res = await this._fetchWithRetry(`${this.apiBase}/api/chat`, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify({
            model: this.model,
            messages: visionMessages,
            tools: AGENT_TOOLS,
            stream: false,
            options: this._buildOptions({ temperature: 0.2, num_predict: Math.max(this.maxTokens, 8192) })
          })
        }, 3, signal);

        if (!res.ok) throw new Error(`Ollama error ${res.status} [${this.apiBase} → ${this.model}]: ${await res.text()}`);
        data = await res.json();
        assistantMsg = data.message;
      } catch (err) {
        if (err.name === 'AbortError') {
          this._notify({ type: 'TASK_STOPPED', messages });
          this._bgMsg('SAVE_TASK_HISTORY', {
            task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
            log, messages, success: false
          }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
          return { success: false, error: 'Durduruldu', log, messages };
        }
        throw err;
      }

      // Show thinking content to user only if thinking mode is enabled
      if (assistantMsg.thinking && this.thinkingMode && this.thinkingMode !== 'off') {
        this._notify({ type: 'AGENT_THOUGHT', content: `💭 ${assistantMsg.thinking.substring(0, 500)}${assistantMsg.thinking.length > 500 ? '...' : ''}` });
      }

      messages.push(assistantMsg);

      // No tool calls — task reaching completion
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        let result = assistantMsg.content || '';

        // ── Auto-open file if agent forgot ──────────────────────────────────
        // If a file was created but file_open was never called, do it now
        if (activeFileKey && !fileOpened) {
          this._notify({ type: 'AGENT_THOUGHT', content: `⚠ Dosya içeriği oluşturuluyor (${activeFileKey})...` });
          try {
            if (fileUpdateCount === 0) {
              // Agent never updated the file — generate HTML from research buffer
              const html = await this._buildFinalHtml(taskDescription, result, researchBuffer, signal);
              if (html) {
                await this._bgMsg('FILE_UPDATE', { fileKey: activeFileKey, content: html });
                fileUpdateCount++;
                this._notify({ type: 'AGENT_THOUGHT', content: '✓ Dosya içeriği oluşturuldu, açılıyor...' });
              }
            }
            await this._bgMsg('FILE_OPEN', { fileKey: activeFileKey });
            fileOpened = true;
            this._notify({ type: 'TOOL_CALL', tool: 'file_open', args: { fileKey: activeFileKey } });
            this._notify({ type: 'TOOL_RESULT', tool: 'file_open', result: { opened: true, auto: true } });
          } catch (e) {
            this._notify({ type: 'AGENT_THOUGHT', content: `⚠ Dosya açma hatası: ${e.message}` });
          }
        }

        // ── Empty result fallback ────────────────────────────────────────────
        if (!result.trim() && iterations > 1) {
          this._notify({ type: 'AGENT_THOUGHT', content: 'Sonuç boş, özet isteniyor...' });
          const fileHint = activeFileKey
            ? ` You created a file with fileKey="${activeFileKey}". Call file_update with your findings and file_open to display it.`
            : '';
          messages.push({
            role: 'user',
            content: `Please provide your final answer now. Summarize all findings in detail.${fileHint}`
          });
          let retryRes;
          try {
            retryRes = await this._fetchWithRetry(`${this.apiBase}/api/chat`, {
              method: 'POST',
              headers: this._headers(),
              body: JSON.stringify({
                model: this.model, messages, tools: AGENT_TOOLS, stream: false,
                options: this._buildOptions({ temperature: 0.2, num_predict: this.maxTokens })
              })
            }, 3, signal);
          } catch (retryErr) {
            if (retryErr.name === 'AbortError') {
              this._notify({ type: 'TASK_STOPPED', messages });
              this._bgMsg('SAVE_TASK_HISTORY', {
                task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
                log, messages, success: false
              }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
              return { success: false, error: 'Durduruldu', log, messages };
            }
            throw retryErr;
          }
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryMsg = retryData.message;
            messages.push(retryMsg);
            if (retryMsg.tool_calls?.length > 0) {
              for (const tc of retryMsg.tool_calls) {
                const tName = tc.function?.name;
                const tArgs = tc.function?.arguments || {};
                this._notify({ type: 'TOOL_CALL', tool: tName, args: tArgs });
                let tResult;
                try { tResult = await this._executeTool(tName, tArgs, tabId); }
                catch (e) { tResult = { error: e.message }; }
                const tSan = this._sanitizeToolResult(tName, tResult);
                this._notify({ type: 'TOOL_RESULT', tool: tName, result: tSan });
                messages.push({ role: 'tool', name: tName, content: JSON.stringify(tSan) });
                if (tName === 'file_open') fileOpened = true;
              }
              result = retryMsg.content || '(dosya oluşturuldu)';
            } else {
              result = retryMsg.content || '';
            }
          }
        }

        log.push({ type: 'final', content: result });
        this._notify({ type: 'TASK_COMPLETE', result, messages, success: true });

        // ── Auto-save recipe if task involved DOM-heavy interaction on a site ──
        const domSteps = log.filter(e => e.type === 'tool' && e.tool?.startsWith('dom_'));
        const navSteps = log.filter(e => e.type === 'tool' && (e.tool === 'tab_navigate' || e.tool === 'tab_create'));
        const toolResults = log.filter(e => e.type === 'tool_result');
        if (domSteps.length >= 2) {
          let site = '';
          for (const ns of navSteps) {
            const url = ns.args?.url || '';
            try {
              const host = new URL(url).hostname.replace(/^www\./, '');
              if (host && !host.includes('localhost') && !host.includes('duckduckgo')) { site = host; break; }
            } catch {}
          }
          if (site) {
            // Only include steps that SUCCEEDED (no error in corresponding tool_result)
            const readOnlyTools = new Set(['dom_get_summary', 'dom_query_all', 'dom_exists', 'dom_get_text', 'dom_get_value']);
            const recipeSteps = [];
            for (let i = 0; i < domSteps.length; i++) {
              const step = domSteps[i];
              if (readOnlyTools.has(step.tool)) continue;
              // Check if this step had an error
              const resultEntry = toolResults.find(r => r.tool === step.tool && r === toolResults[recipeSteps.length]);
              const hadError = resultEntry?.error || (resultEntry?.result && typeof resultEntry.result === 'object' && resultEntry.result.error);
              if (!hadError) {
                recipeSteps.push({
                  action: step.tool,
                  selector: step.args?.selector || '',
                  value: step.args?.value || (step.tool === 'dom_keypress' ? step.args?.key : ''),
                  note: ''
                });
              }
            }
            // Take the LAST successful segment (most likely the actual working flow)
            const finalSteps = recipeSteps.slice(-8);
            if (finalSteps.length >= 2) {
              this._bgMsg('MEMORY_SAVE_RECIPE', {
                site,
                task: taskDescription.substring(0, 100),
                steps: finalSteps
              }).catch((e) => { console.warn('[Agentia] Recipe auto-save failed:', e.message); });
              this._notify({ type: 'AGENT_THOUGHT', content: `📓 Recipe saved for ${site}: ${finalSteps.length} steps` });
            }
          }
        }

        // ── Auto-generate report file if research was done but no file was created ──
        if (!activeFileKey && researchBuffer.length >= 1) {
          this._notify({ type: 'AGENT_THOUGHT', content: '📄 Araştırma raporu otomatik oluşturuluyor...' });
          try {
            const html = await this._buildFinalHtml(taskDescription, result, researchBuffer, signal);
            if (html) {
              const fileResult = await this._bgMsg('FILE_CREATE', { name: taskDescription.substring(0, 50), content: html, type: 'html' });
              if (fileResult?.fileKey) {
                activeFileKey = fileResult.fileKey;
                await this._bgMsg('FILE_OPEN', { fileKey: activeFileKey });
                fileOpened = true;
                this._notify({ type: 'AGENT_THOUGHT', content: '📄 Rapor oluşturuldu ve açıldı' });
              }
            }
          } catch (e) {
            this._notify({ type: 'AGENT_THOUGHT', content: `Rapor oluşturma hatası: ${e.message}` });
          }
        }

        this._bgMsg('SAVE_TASK_HISTORY', {
          task: taskDescription, result, log, messages, success: true,
          reportFileKey: activeFileKey || null
        }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
        this._bgMsg('MEMORY_ADD_TASK', {
          task: taskDescription,
          summary: result.substring(0, 500),
          success: true
        }).catch((e) => { console.warn('[Agentia] Memory save failed:', e.message); });
        return { success: true, result, log, messages };
      }

      this._notify({ type: 'AGENT_THOUGHT', content: assistantMsg.content || '' });

      // ── Determine which tool calls can run in parallel ────────────────────
      // Read-only DOM tools and independent tab operations can be parallelized.
      // State-mutating tools (click, type, navigate, file ops) must stay sequential.
      const READ_ONLY_TOOLS = new Set([
        'tab_get_active', 'tab_get_all', 'tab_screenshot',
        'dom_get_text', 'dom_get_value', 'dom_exists', 'dom_query_all',
        'dom_get_summary', 'dom_extract', 'page_get_info', 'pdf_read',
        'memory_recall', 'web_search'
      ]);

      const toolCalls = assistantMsg.tool_calls;
      const parallelBatches = [];
      let currentBatch = [];

      for (const tc of toolCalls) {
        const toolName = tc.function?.name;
        if (READ_ONLY_TOOLS.has(toolName) && currentBatch.every(t => READ_ONLY_TOOLS.has(t.function?.name))) {
          currentBatch.push(tc);
        } else {
          if (currentBatch.length > 0) parallelBatches.push(currentBatch);
          currentBatch = [tc]; // Sequential tool starts a new batch
        }
      }
      if (currentBatch.length > 0) parallelBatches.push(currentBatch);

      // Execute batches: tools within a batch run in parallel, batches run sequentially
      for (const batch of parallelBatches) {
        // Check abort signal before each batch
        if (signal?.aborted) {
          this._notify({ type: 'TASK_STOPPED', messages });
          this._bgMsg('SAVE_TASK_HISTORY', {
            task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
            log, messages, success: false
          }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
          return { success: false, error: 'Durduruldu', log, messages };
        }

        const isParallel = batch.length > 1 && batch.every(tc => READ_ONLY_TOOLS.has(tc.function?.name));

        const execTool = async (tc) => {
          const toolName = tc.function?.name;
          const toolArgs = tc.function?.arguments || {};
          this._notify({ type: 'TOOL_CALL', tool: toolName, args: toolArgs });
          log.push({ type: 'tool', tool: toolName, args: toolArgs });

          let toolResult;
          try {
            toolResult = await this._executeTool(toolName, toolArgs, tabId);
            const sanitized = this._sanitizeToolResult(toolName, toolResult);
            log.push({ type: 'tool_result', tool: toolName, result: sanitized });
            this._notify({ type: 'TOOL_RESULT', tool: toolName, result: sanitized });

            // ── Capture research data for fallback HTML generation ─────────────
            if (toolName === 'tab_navigate' || toolName === 'tab_create') {
              currentPageUrl = toolResult?.url || '';
            }
            if (['dom_get_text', 'dom_extract', 'dom_query_all', 'dom_get_summary', 'page_get_info', 'pdf_read', 'web_search'].includes(toolName) && toolResult) {
              let snippet = '';
              if (toolResult.text) snippet = toolResult.text;
              else if (toolResult.content) snippet = toolResult.content;
              else if (toolResult.results) snippet = toolResult.results.map(r => `[${r.title}](${r.url}) ${r.snippet}`).join('\n');
              else if (toolResult.elements) snippet = toolResult.elements.map(e => [e.text, e.href].filter(Boolean).join(' ')).join('\n');
              else if (toolResult.pages) snippet = toolResult.pages.map(p => `[Page ${p.page}] ${p.text}`).join('\n');
              else if (toolResult.url) snippet = `[${toolResult.title}](${toolResult.url})`;
              // dom_get_summary: extract text from buttons, links, and other structured data
              else if (toolResult.buttons || toolResult.links || toolResult.other) {
                const parts = [];
                if (toolResult.title) parts.push(`Title: ${toolResult.title}`);
                if (toolResult.loggedIn !== undefined) parts.push(`Logged in: ${toolResult.loggedIn}`);
                if (toolResult.buttons?.length) parts.push(`Buttons: ${toolResult.buttons.map(b => b.text || b.selector || b.ariaLabel).filter(Boolean).join(', ')}`);
                if (toolResult.links?.length) parts.push(`Links: ${toolResult.links.slice(0, 20).map(l => `${l.text || l.selector}→${l.href || ''}`).join(', ')}`);
                if (toolResult.inputs?.length) parts.push(`Inputs: ${toolResult.inputs.map(i => i.label || i.selector || i.type).filter(Boolean).join(', ')}`);
                if (toolResult.other?.length) parts.push(`Elements: ${toolResult.other.slice(0, 10).map(o => o.text || o.selector).filter(Boolean).join(', ')}`);
                snippet = parts.join('\n');
              }
              if (snippet.length > 40) {
                researchBuffer.push({ url: currentPageUrl, text: snippet.slice(0, 3000) });
              }
            }

            // ── Track file operations ──────────────────────────────────────────
            if (toolName === 'file_create' && sanitized.fileKey) {
              activeFileKey = sanitized.fileKey;
              fileUpdateCount = 0;
              fileOpened = false;
            } else if (toolName === 'file_update') {
              fileUpdateCount++;
            } else if (toolName === 'file_open') {
              fileOpened = true;
            } else if (toolName === 'create_file' && sanitized.fileKey) {
              // create_file opens automatically, treat as opened
              activeFileKey = sanitized.fileKey;
              fileOpened = true;
            }

            // ── Track screenshot for vision models ──────────────────────────────
            if (toolName === 'tab_screenshot' && this._isVisionModel() && toolResult?.dataUrl) {
              pendingScreenshot = await this._compressScreenshot(toolResult.dataUrl);
            }

            messages.push({ role: 'tool', name: toolName, content: JSON.stringify(sanitized) });

            // ── Stuck detection: track consecutive DOM failures ────────────────
            const isDomAction = ['dom_click', 'dom_type', 'dom_clear', 'dom_scroll', 'dom_hover', 'dom_select', 'dom_keypress'].includes(toolName);
            const isDomQuery = ['dom_get_text', 'dom_get_value', 'dom_exists', 'dom_query_all'].includes(toolName);
            if ((isDomAction || isDomQuery) && sanitized?.error) {
              consecutiveDomFailures++;
            } else if (isDomAction || isDomQuery) {
              consecutiveDomFailures = 0;
            }
          } catch (err) {
            toolResult = { error: err.message };
            log.push({ type: 'tool_error', tool: toolName, error: err.message });
            this._notify({ type: 'TOOL_ERROR', tool: toolName, error: err.message });
            messages.push({ role: 'tool', name: toolName, content: JSON.stringify({ error: err.message }) });

            // Stuck detection for thrown errors too
            const isDomTool = toolName.startsWith('dom_');
            if (isDomTool) consecutiveDomFailures++;
          }
        };

        if (isParallel) {
          await Promise.all(batch.map(tc => execTool(tc)));
        } else {
          for (const tc of batch) {
            await execTool(tc);
          }
        }

        // Check abort signal after each batch
        if (signal?.aborted) {
          this._notify({ type: 'TASK_STOPPED', messages });
          this._bgMsg('SAVE_TASK_HISTORY', {
            task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
            log, messages, success: false
          }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
          return { success: false, error: 'Durduruldu', log, messages };
        }

        // ── Stuck detection: inject guidance after repeated DOM failures ────────
        if (consecutiveDomFailures >= 3) {
          consecutiveDomFailures = 0;  // Reset to avoid repeating
          this._notify({ type: 'AGENT_THOUGHT', content: '⚠ Stuck detected — injecting guidance...' });
          messages.push({
            role: 'user',
            content: `[STUCK RECOVERY] You've failed to find the right DOM element 3+ times. Stop guessing selectors and try this approach:\n1. Call dom_get_summary to see ALL interactive elements on the page grouped by type (buttons, links, inputs)\n2. Use the exact selector from the result (prefer data-testid, aria-label, or id selectors)\n3. If still stuck, try keyboard shortcuts (e.g., 'n' for new post on social media) or try dom_keypress with key="Enter"\n4. NEVER try more than 2 different selectors for the same action before calling dom_get_summary`
          });
        }
      }
    }

    // Max iterations — still auto-open file if one was created
    if (activeFileKey && !fileOpened) {
      this._notify({ type: 'AGENT_THOUGHT', content: '⚠ Max iterasyon — dosya içeriği oluşturuluyor...' });
      try {
        if (fileUpdateCount === 0) {
          const html = await this._buildFinalHtml(taskDescription, '', researchBuffer, signal);
          if (html) await this._bgMsg('FILE_UPDATE', { fileKey: activeFileKey, content: html });
        }
        await this._bgMsg('FILE_OPEN', { fileKey: activeFileKey });
        this._notify({ type: 'TOOL_CALL', tool: 'file_open', args: { fileKey: activeFileKey } });
        this._notify({ type: 'TOOL_RESULT', tool: 'file_open', result: { opened: true, auto: true } });
      } catch {}
    }

    this._bgMsg('SAVE_TASK_HISTORY', {
      task: taskDescription,
      result: 'Max iterasyon limitine ulaşıldı',
      log, messages, success: false
    }).catch((e) => { console.warn('[Agentia] Task history save failed:', e.message); });
    this._bgMsg('MEMORY_ADD_TASK', {
      task: taskDescription,
      summary: 'Max iterasyon — kısmi sonuç kaydedildi',
      success: false
    }).catch((e) => { console.warn('[Agentia] Memory save failed:', e.message); });
    return { success: false, error: 'Max iterations reached', log, messages };
  }

  // ---- Final HTML Builder (fallback when agent forgot to call file_update) ----
  // Uses research buffer + one extra LLM call to generate HTML from raw findings
  async _buildFinalHtml(taskDescription, agentTextResult, researchBuffer, signal = null) {
    // Combine research buffer into a readable summary
    const bufferText = researchBuffer
      .map((item, i) => `--- Kaynak ${i + 1}${item.url ? ' (' + item.url + ')' : ''} ---\n${item.text}`)
      .join('\n\n');

    // If we have nothing, use the agent's text result
    const context = bufferText || agentTextResult || '(Araştırma verisi bulunamadı)';

    // Dynamic context limit: use more of the research data for larger buffers
    // but cap at 48000 to avoid exceeding model context window
    const maxContext = Math.min(context.length, 48000);

    this._notify({ type: 'AGENT_THOUGHT', content: `📄 ${researchBuffer.length} kaynaktan HTML oluşturuluyor (${Math.round(maxContext / 1024)}KB veri)...` });

    try {
      const res = await this._fetchWithRetry(`${this.apiBase}/api/chat`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert web developer. Generate beautiful, complete HTML pages. Output ONLY raw HTML starting with <!DOCTYPE html> — no markdown, no explanation, no code fences.'
            },
            {
              role: 'user',
              content: `Task: "${taskDescription}"\n\nResearch data collected:\n\n${context.slice(0, maxContext)}\n\nCreate a complete, visually rich HTML page presenting all the findings above.\n\nRequirements:\n- Inline CSS only (no external files)\n- Gradient header with page title\n- Card grid layout for items (3 columns, responsive)\n- Each card: title, description, source URL as link\n- Modern design: rounded corners, shadows, hover effects\n- Turkish or same language as task\n- Start with <!DOCTYPE html> and include everything in one file\n\nOutput ONLY the HTML code:`
            }
          ],
          stream: false,
          options: this._buildOptions({ temperature: 0.3, num_predict: 16384 })
        })
      }, 3, signal);

      if (!res.ok) return null;
      const data = await res.json();
      let html = data.message?.content || '';

      // Strip markdown code fences if model wrapped it anyway
      html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();

      // Validate it's actually HTML
      if (html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html')) {
        return html;
      }

      // If model returned plain text, wrap it
      if (html.length > 50) {
        return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${taskDescription}</title><style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:960px;margin:40px auto;padding:20px;background:#f5f6fa;color:#1a1d2e}h1{background:linear-gradient(135deg,#5b52e8,#3a7bd5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:2em;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #dde1f0}.content{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.08);white-space:pre-wrap;line-height:1.8}</style></head><body><h1>${taskDescription}</h1><div class="content">${html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></body></html>`;
      }

      return null;
    } catch (e) {
      this._notify({ type: 'AGENT_THOUGHT', content: `HTML oluşturma hatası: ${e.message}` });
      return null;
    }
  }

  // ---- Tool Execution ----
  async _executeTool(tool, args, defaultTabId) {
    const tabId = args.tabId || defaultTabId;

    switch (tool) {
      case 'tab_create':
        return this._bgMsg('TAB_ACTION', { action: 'create', url: args.url, active: args.active });
      case 'tab_close':
        return this._bgMsg('TAB_ACTION', { action: 'close', tabId: args.tabId });
      case 'tab_navigate':
        return this._bgMsg('TAB_ACTION', { action: 'navigate', tabId, url: args.url });
      case 'tab_activate':
        return this._bgMsg('TAB_ACTION', { action: 'activate', tabId: args.tabId });
      case 'tab_get_all':
        return this._bgMsg('TAB_ACTION', { action: 'get_all' });
      case 'tab_get_active':
        return this._bgMsg('TAB_ACTION', { action: 'get_active' });
      case 'tab_screenshot':
        return this._bgMsg('TAB_ACTION', { action: 'screenshot' });
      case 'tab_reload':
        return this._bgMsg('TAB_ACTION', { action: 'reload', tabId });
      case 'tab_back':
        return this._bgMsg('TAB_ACTION', { action: 'go_back', tabId });
      case 'tab_forward':
        return this._bgMsg('TAB_ACTION', { action: 'go_forward', tabId });

      case 'dom_click':
        return this._bgMsg('DOM_ACTION', { action: 'click', selector: args.selector, x: args.x, y: args.y, tabId });
      case 'dom_type':
        return this._bgMsg('DOM_ACTION', { action: 'type', selector: args.selector, value: args.value, tabId });
      case 'dom_clear':
        return this._bgMsg('DOM_ACTION', { action: 'clear', selector: args.selector, tabId });
      case 'dom_scroll':
        return this._bgMsg('DOM_ACTION', { action: 'scroll', selector: args.selector, y: args.y, tabId });
      case 'dom_hover':
        return this._bgMsg('DOM_ACTION', { action: 'hover', selector: args.selector, tabId });
      case 'dom_select':
        return this._bgMsg('DOM_ACTION', { action: 'select', selector: args.selector, value: args.value, tabId });
      case 'dom_keypress':
        return this._bgMsg('DOM_ACTION', { action: 'keypress', selector: args.selector, key: args.key, tabId });
      case 'dom_get_text':
        return this._bgMsg('DOM_ACTION', { action: 'get_text', selector: args.selector, tabId });
      case 'dom_get_value':
        return this._bgMsg('DOM_ACTION', { action: 'get_value', selector: args.selector, tabId });
      case 'dom_exists':
        return this._bgMsg('DOM_ACTION', { action: 'exists', selector: args.selector, tabId });
      case 'dom_query_all':
        return this._bgMsg('DOM_ACTION', { action: 'query_all', selector: args.selector, tabId });
      case 'dom_get_summary':
        return this._bgMsg('DOM_ACTION', { action: 'get_dom_summary', tabId });
      case 'dom_extract':
        return this._bgMsg('DOM_ACTION', { action: 'extract_data', fields: args.fields, tabId });

      case 'page_get_info':
        return this._bgMsg('GET_PAGE_INFO', { tabId });

      case 'pdf_read':
        return this._bgMsg('PDF_READ', { url: args.url, pages: args.pages, tabId });

      case 'recording_start':
        return this._bgMsg('RECORDING_START', { name: args.name, tabId: args.tabId || tabId });
      case 'recording_stop':
        return this._bgMsg('RECORDING_STOP', { tabId: args.tabId || tabId });
      case 'replay':
        return this._bgMsg('REPLAY_RECORDING', {
          recordingId: args.recordingId, tabId: args.tabId || tabId, adaptive: args.adaptive
        });

      case 'wait':
        await new Promise(r => setTimeout(r, Math.min(args.ms || 1000, 10000)));
        return { waited: args.ms };

      case 'create_file':
        return this._bgMsg('CREATE_FILE', {
          name: args.name,
          content: args.content,
          type: args.type || 'text'
        });

      case 'file_create':
        return this._bgMsg('FILE_CREATE', {
          name: args.name,
          content: args.content,
          type: args.type || 'html'
        });

      case 'file_update':
        return this._bgMsg('FILE_UPDATE', {
          fileKey: args.fileKey,
          content: args.content
        });

      case 'file_open':
        return this._bgMsg('FILE_OPEN', { fileKey: args.fileKey });

      case 'memory_save':
        return this._bgMsg('MEMORY_ADD_LEARNED', { topic: args.topic, info: args.info });

      case 'memory_recall':
        return this._bgMsg('MEMORY_GET', { query: args.query });

      case 'memory_save_recipe':
        return this._bgMsg('MEMORY_SAVE_RECIPE', { site: args.site, task: args.task, steps: args.steps });

      case 'image_save':
        return this._bgMsg('IMAGE_SAVE', { url: args.url });

      case 'web_search':
        return this._bgMsg('WEB_SEARCH', { query: args.query, maxResults: args.maxResults });

      default:
        throw new Error(`Unknown tool: "${tool}". Available tools: tab_create, tab_close, tab_navigate, tab_screenshot, tab_get_active, tab_get_all, tab_reload, tab_back, tab_forward, dom_click, dom_type, dom_clear, dom_scroll, dom_hover, dom_select, dom_keypress, dom_get_text, dom_exists, dom_query_all, dom_get_summary, dom_extract, page_get_info, pdf_read, wait, recording_start, recording_stop, replay, create_file, file_create, file_update, file_open, memory_save, memory_recall, memory_save_recipe, image_save, web_search.`);
    }
  }

  // Sanitize tool results before sending to LLM — strip huge data
  _sanitizeToolResult(tool, result) {
    if (!result || typeof result !== 'object') return result;

    // ── Tab operations: always return clean { tabId, url, title } ─────────────
    // Raw Chrome Tab objects have 30+ fields — LLM loses the tabId in the noise
    if (tool === 'tab_create' || tool === 'tab_get_active' || tool === 'tab_reload') {
      // Chrome Tab object has .id
      if (result.id !== undefined) {
        return { tabId: result.id, url: result.url || '', title: result.title || '' };
      }
    }
    if (tool === 'tab_navigate') {
      // Returns { navigated: true, url }
      return { navigated: result.navigated || true, url: result.url || '' };
    }
    if (tool === 'tab_get_all') {
      // Array of tabs — trim each to essentials
      if (Array.isArray(result)) {
        return result.slice(0, 10).map(t => ({ tabId: t.id, url: t.url, title: t.title, active: t.active }));
      }
    }

    // File tools: never send content back — just confirm with fileKey
    if (tool === 'file_create') {
      return { fileKey: result.fileKey, created: true };
    }
    if (tool === 'file_update') {
      return { fileKey: result.fileKey, updated: true };
    }
    if (tool === 'file_open') {
      return { opened: true, url: result.url };
    }
    if (tool === 'create_file') {
      return { fileKey: result.fileKey, opened: true };
    }

    // Screenshot: confirm capture. Image data is sent via pendingScreenshot in runTask loop.
    if (tool === 'tab_screenshot') {
      if (this._isVisionModel()) {
        return { screenshot: 'attached', note: 'Screenshot image attached to next LLM call. Use it to identify elements on the page.' };
      }
      return { screenshot: 'taken', note: 'Screenshot captured but model does not support vision. Use dom_get_summary instead.' };
    }

    // page_get_info: strip full HTML, keep url+title only
    if (tool === 'page_get_info') {
      return { url: result.url, title: result.title, isPdf: result.isPdf || false, hint: result.hint };
    }

    // pdf_read: limit total text to ~8000 chars for context window
    if (tool === 'pdf_read' && result.pages) {
      let totalChars = 0;
      const limitedPages = [];
      for (const p of result.pages) {
        if (totalChars + p.text.length > 8000) {
          limitedPages.push({ page: p.page, text: p.text.substring(0, 8000 - totalChars) + '...' });
          break;
        }
        limitedPages.push(p);
        totalChars += p.text.length;
      }
      return {
        title: result.title,
        totalPages: result.totalPages,
        pagesRead: limitedPages.length,
        pages: limitedPages,
        charCount: result.charCount,
        truncated: limitedPages.length < result.pages.length
      };
    }

    // memory_save: just confirm
    if (tool === 'memory_save') {
      return { saved: true, topic: result?.topic || args?.topic };
    }

    // memory_recall: return as-is (already limited by buildMemoryPrompt)
    if (tool === 'memory_recall') {
      return result || { memories: [], note: 'No relevant memories found' };
    }

    // memory_save_recipe: just confirm
    if (tool === 'memory_save_recipe') {
      return { saved: true, site: result?.site, task: result?.task };
    }

    // dom_query_all: limit elements and truncate text
    if (tool === 'dom_query_all' && result.elements) {
      return {
        count: result.count,
        elements: result.elements.slice(0, 25).map(el => ({
          tag: el.tag,
          id: el.id,
          text: (el.text || '').substring(0, 100),
          href: (el.href || '').substring(0, 200),
          value: el.value
        }))
      };
    }

    // dom_get_summary: grouped format (buttons, links, inputs, other)
    if (tool === 'dom_get_summary') {
      const trim = (arr, max) => (arr || []).slice(0, max).map(el => {
        const out = { selector: el.selector };
        if (el.text) out.text = el.text.substring(0, 80);
        if (el.iconButton) out.iconButton = true;
        if (el.position) out.position = el.position;
        if (el['aria-label']) out['aria-label'] = el['aria-label'];
        if (el.href) out.href = el.href.substring(0, 150);
        if (el.type) out.type = el.type;
        if (el.placeholder) out.placeholder = el.placeholder;
        return out;
      });
      const out = {
        url: result.url,
        title: result.title,
        loggedIn: result.loggedIn,
        buttons: trim(result.buttons, 12),
        links: trim(result.links, 15),
        inputs: trim(result.inputs, 10),
        other: trim(result.other, 5)
      };
      if (result.loginHint) out.loginHint = result.loginHint;
      return out;
    }

    // Generic: if JSON is very large, truncate
    const str = JSON.stringify(result);
    if (str.length > 2000) {
      return { truncated: true, preview: str.substring(0, 2000) + '...' };
    }

    return result;
  }

  // Patched by background.js to call handlers directly
  _bgMsg(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.success === false) return reject(new Error(response.error || 'Error'));
        resolve(response?.data);
      });
    });
  }

  _notify(data) {
    chrome.runtime.sendMessage({ type: 'AGENT_EVENT', data }).catch((e) => { console.warn('[Agentia] Event notification failed:', e.message); });
  }

  _withSystem(messages) {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const fullSystem = buildSystemPrompt(
      AGENT_SYSTEM_PROMPT_BASE,
      this.systemPrompt,
      this._buildMemoryPrompt(lastUserMsg)
    );
    return [{ role: 'system', content: fullSystem }, ...messages];
  }

  // ---- Adaptive Replay ----
  async adaptiveReplay(recording, tabId) {
    const results = [];
    this._notify({ type: 'ADAPTIVE_REPLAY_START', recording: recording.name });

    for (const event of recording.events) {
      let result;

      try {
        result = await this._executeRecordedEvent(event, tabId);
        results.push({ event, result, success: true, adapted: false });
      } catch (directErr) {
        this._notify({ type: 'ADAPTIVE_FALLBACK', event, error: directErr.message });

        try {
          result = await this._adaptAndExecute(event, tabId);
          results.push({ event, result, success: true, adapted: true });
        } catch (adaptErr) {
          results.push({ event, error: adaptErr.message, success: false });
          this._notify({ type: 'ADAPTIVE_FAILED', event, error: adaptErr.message });
        }
      }

      const delay = Math.min(event.delay || 400, 2000);
      await new Promise(r => setTimeout(r, delay));
    }

    this._notify({ type: 'ADAPTIVE_REPLAY_DONE', results });
    return { results, success: results.every(r => r.success) };
  }

  async _adaptAndExecute(event, tabId) {
    const [domSummary, pageInfo] = await Promise.all([
      this._bgMsg('DOM_ACTION', { action: 'get_dom_summary', tabId }),
      this._bgMsg('GET_PAGE_INFO', { tabId })
    ]);

    const prompt = `A browser recording action failed. Find the equivalent element on the current page.

Original action:
${JSON.stringify({ type: event.type, selector: event.selector, text: event.text, value: event.value }, null, 2)}

Current page: ${pageInfo?.url} — "${pageInfo?.title}"

Interactive elements (first 30):
${JSON.stringify(domSummary?.interactive?.slice(0, 30), null, 2)}

Respond ONLY with JSON (no markdown):
{"selector": "CSS_SELECTOR_OR_NULL", "confidence": 0.0_to_1.0, "reason": "brief explanation"}`;

    const response = await this.chat([{ role: 'user', content: prompt }], tabId);

    let parsed;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('LLM returned unparseable response');
    }

    if (!parsed.selector || parsed.confidence < 0.3) {
      throw new Error(`No equivalent element: ${parsed.reason}`);
    }

    return await this._executeRecordedEvent({ ...event, selector: parsed.selector }, tabId);
  }

  async _executeRecordedEvent(event, tabId) {
    switch (event.type) {
      case 'navigate':
        return this._bgMsg('TAB_ACTION', { action: 'navigate', tabId, url: event.url });
      case 'click':
        return this._bgMsg('DOM_ACTION', { action: 'click', selector: event.selector, tabId });
      case 'type':
        return this._bgMsg('DOM_ACTION', { action: 'type', selector: event.selector, value: event.value, tabId });
      case 'scroll':
        return this._bgMsg('DOM_ACTION', { action: 'scroll', y: event.y, tabId });
      case 'select':
        return this._bgMsg('DOM_ACTION', { action: 'select', selector: event.selector, value: event.value, tabId });
      case 'keypress':
        return this._bgMsg('DOM_ACTION', { action: 'keypress', selector: event.selector, key: event.key, tabId });
      default:
        return { skipped: event.type };
    }
  }
}
