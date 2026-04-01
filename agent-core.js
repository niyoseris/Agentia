// AgentCore — Ollama local + cloud, native tool calling, adaptive replay

// Native tool definitions for Ollama's tools array
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'tab_create',
      description: 'Open a new browser tab',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open (optional)' },
          active: { type: 'boolean', description: 'Make tab active (default true)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_close',
      description: 'Close a browser tab',
      parameters: {
        type: 'object',
        required: ['tabId'],
        properties: {
          tabId: { type: 'number', description: 'Tab ID to close' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_navigate',
      description: 'Navigate to a URL in a tab',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          tabId: { type: 'number', description: 'Tab ID (default: active tab)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_get_active',
      description: 'Get the currently active tab info (id, url, title)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_get_all',
      description: 'Get all open tabs',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_reload',
      description: 'Reload a tab',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Tab ID (default: active tab)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_back',
      description: 'Go back in browser history',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_forward',
      description: 'Go forward in browser history',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_click',
      description: 'Click an element on the page using a CSS selector',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element to click' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        required: ['selector', 'value'],
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input' },
          value: { type: 'string', description: 'Text to type' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_clear',
      description: 'Clear an input field',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_scroll',
      description: 'Scroll the page or scroll to an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Scroll to this element (optional)' },
          y: { type: 'number', description: 'Pixels to scroll vertically (if no selector)' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_hover',
      description: 'Hover over an element',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_select',
      description: 'Select an option from a <select> dropdown',
      parameters: {
        type: 'object',
        required: ['selector', 'value'],
        properties: {
          selector: { type: 'string' },
          value: { type: 'string', description: 'Option value to select' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_keypress',
      description: 'Press a keyboard key (e.g. Enter, Escape, Tab)',
      parameters: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Key name: Enter, Escape, Tab, ArrowDown, etc.' },
          selector: { type: 'string', description: 'Focus this element first (optional)' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_get_text',
      description: 'Get the text content of an element',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_exists',
      description: 'Check if an element exists on the page',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_query_all',
      description: 'Find all elements matching a CSS selector',
      parameters: {
        type: 'object',
        required: ['selector'],
        properties: {
          selector: { type: 'string' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_get_summary',
      description: 'Get a summary of all interactive elements on the current page (buttons, links, inputs). Use this before clicking to find correct selectors.',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_extract',
      description: 'Extract multiple data fields from the page using CSS selectors',
      parameters: {
        type: 'object',
        required: ['fields'],
        properties: {
          fields: {
            type: 'object',
            description: 'Map of field name to CSS selector, e.g. {"title": "h1", "price": ".price"}'
          },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'page_get_info',
      description: 'Get current page URL, title, and a snippet of HTML',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Wait for a specified number of milliseconds',
      parameters: {
        type: 'object',
        required: ['ms'],
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait (max 10000)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recording_start',
      description: 'Start recording browser actions',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name for this recording' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recording_stop',
      description: 'Stop the current recording',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replay',
      description: 'Replay a saved recording',
      parameters: {
        type: 'object',
        required: ['recordingId'],
        properties: {
          recordingId: { type: 'string' },
          tabId: { type: 'number' },
          adaptive: { type: 'boolean', description: 'Use AI to adapt selectors if elements are not found' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Quick shortcut: create a file AND immediately open it in a new tab in one step. Use this only for final one-shot outputs. For progressive research tasks use file_create + file_update + file_open instead.',
      parameters: {
        type: 'object',
        required: ['name', 'content'],
        properties: {
          name: { type: 'string', description: 'File name, e.g. "Search Results"' },
          content: { type: 'string', description: 'Full file content' },
          type: {
            type: 'string',
            enum: ['text', 'markdown', 'html', 'json'],
            description: 'Content type'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_create',
      description: 'Create a new file in storage and return its fileKey. Use at the START of any research/report task to establish the page skeleton. Returns { fileKey } — save this for file_update and file_open calls.',
      parameters: {
        type: 'object',
        required: ['name', 'content', 'type'],
        properties: {
          name: { type: 'string', description: 'Display name, e.g. "Europe Hidden Gems Guide"' },
          content: { type: 'string', description: 'Initial HTML/text content — can be a skeleton that you will fill in with file_update calls' },
          type: {
            type: 'string',
            enum: ['html', 'markdown', 'json', 'text'],
            description: 'Use html for rich visual pages with images and styling'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_update',
      description: 'Replace the content of a previously created file. Call this progressively as you research — each call replaces the full content, so always include all accumulated content. Use to build the page incrementally.',
      parameters: {
        type: 'object',
        required: ['fileKey', 'content'],
        properties: {
          fileKey: { type: 'string', description: 'The fileKey returned by file_create' },
          content: { type: 'string', description: 'New complete content (replaces previous version entirely)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_open',
      description: 'Open a previously created/updated file in a new browser tab. Call this as the LAST step after all file_update calls are done.',
      parameters: {
        type: 'object',
        required: ['fileKey'],
        properties: {
          fileKey: { type: 'string', description: 'The fileKey returned by file_create' }
        }
      }
    }
  }
];

// Base system prompt (date/time injected at runtime in runTask)
const AGENT_SYSTEM_PROMPT_BASE = `You are Agentia, an agentic browser assistant. You control the user's browser by calling tools. Be efficient and thorough.

## Current Information
[DATE_TIME_INJECTED_HERE]

IMPORTANT: Your knowledge has a cutoff date. For any recent events, current prices, latest products, trending topics, or time-sensitive information:
- ALWAYS browse the web to get current data
- Do NOT rely on your training data
- Search for the latest news, reviews, and information

## Core Rules
- tab_create and tab_navigate both wait for the page to fully load before returning — you do NOT need an extra wait() call after them. Go directly to DOM actions.
- tab_create returns { tabId, url, title } — ALWAYS save this tabId and pass it to every subsequent tool call on that tab. Never call dom_* without a tabId after opening a new tab.
- Call dom_get_summary ONCE per page to understand the layout — do not repeat it
- Never call page_get_info and dom_get_summary on the same page — pick one
- For links/products: use href values from dom_query_all with tab_navigate instead of dom_click
- When you have enough data to answer a simple question, stop browsing and respond

## Web Search
Prefer DuckDuckGo — it exposes real links without obfuscation:
  tab_navigate(tabId, "https://duckduckgo.com/?q=your+query")
  dom_query_all({ selector: "article[data-testid='result'] a[data-testid='result-title-a']", tabId })
  → each element has .text (title) and .href (real URL)

For Google search results:
  dom_query_all({ selector: "#search .g h3", tabId }) → titles
  dom_query_all({ selector: "#search .g a:first-of-type", tabId }) → links (use .href)
  Avoid selector "div.g a[href^='http']" — it returns 0 results on current Google DOM.

## File & Report Tasks (MANDATORY)
When the user asks for a report, guide, list, HTML page, or any document:

**ALWAYS use Progressive Mode (file_create → research → file_update → file_open):**
1. file_create(name, skeletonHtml, type='html') → returns { fileKey }. SAVE THIS KEY.
2. Research: browse, extract data, collect snippets.
3. file_update(fileKey, accumulatedHtml) after EACH meaningful source — always send FULL HTML so far.
4. file_open(fileKey) as VERY LAST step — only when ALL research is done.

Why progressive:
- You get live feedback (viewer auto-refreshes every 3 seconds)
- If max iterations hit, file is already filled with partial results
- User can watch progress in real-time

**Rules:**
- NEVER say "I'll create the file now" — just call file_create immediately
- NEVER skip file_create/file_update/file_open — they are mandatory for all document tasks
- After each source/finding, call file_update with the FULL accumulated HTML (includes all previous items + new item)
- ALWAYS end with file_open(fileKey) before task completes

## HTML File Quality
When creating HTML reports:
- Use inline CSS with a beautiful modern design (gradient headers, card grid layout, shadows)
- For location/product/travel pages: each item gets a card with image (use real URLs from research), title, description, and details
- Include a page header with title and subtitle
- Images: use <img src="URL"> with real image URLs found during research (from unsplash, wikipedia, travel sites, etc.)
- Make it visually rich — this is what the user will see in their browser

## Twitter/X
- (1) dom_click the contenteditable box, (2) wait 500ms, (3) dom_type text, (4) wait 500ms, (5) dom_click [data-testid="tweetButtonInline"], (6) wait 2000ms, (7) verify with dom_exists
- contenteditable elements (Twitter, Gmail etc.) work fine with dom_type

## Other
- For product listings: dom_query_all with "[data-component-type='s-search-result'] .a-size-base-plus" for names
- If typing has no effect: dom_click the field first, wait 300ms, then dom_type`;

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
    this.maxToolIterations = 60;
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
    if (settings.maxIterations) this.maxToolIterations = settings.maxIterations;
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

  // ---- Plain Chat (no tools) ----
  async chat(messages, tabId) {
    const allMessages = this._withSystem(messages);

    const res = await fetch(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: false,
        options: { temperature: this.temperature, num_predict: this.maxTokens }
      })
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content || '';
  }

  // ---- Streaming Chat (no tools) ----
  async streamChat(messages, tabId, onChunk) {
    const allMessages = this._withSystem(messages);

    const res = await fetch(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: true,
        options: { temperature: this.temperature, num_predict: this.maxTokens }
      })
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);

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
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US');
    const systemPrompt = AGENT_SYSTEM_PROMPT_BASE.replace('[DATE_TIME_INJECTED_HERE]', `Today's date: ${dateStr}\nCurrent time: ${timeStr}`);

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

    // File tracking — ensure file_open is always called when a file was created
    let activeFileKey = null;   // fileKey from the most recent file_create call
    let fileUpdateCount = 0;    // how many file_update calls have been made
    let fileOpened = false;     // whether file_open was called
    let currentPageUrl = '';    // track current page for research buffer

    // Research buffer — raw text snippets collected during browsing
    // Used to build the final HTML if the model never called file_update
    const researchBuffer = [];

    this._notify({ type: 'TASK_START', task: taskDescription });

    while (iterations < this.maxToolIterations) {
      // Check abort signal before each LLM call
      if (signal?.aborted) {
        this._notify({ type: 'TASK_STOPPED', messages });
        this._bgMsg('SAVE_TASK_HISTORY', {
          task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
          log, messages, success: false
        }).catch(() => {});
        return { success: false, error: 'Durduruldu', log, messages };
      }

      // ── Auto-checkpoint: force file_update from researchBuffer ────────────
      // Every 6 iterations: if file was created but NEVER updated, auto-write
      // partial content from researchBuffer WITHOUT asking the LLM.
      // (Reminders don't work — LLM says "OK" but never calls file_update)
      if (activeFileKey && !fileOpened && iterations > 0 && iterations % 6 === 0 && fileUpdateCount === 0 && researchBuffer.length >= 1) {
        this._notify({ type: 'AGENT_THOUGHT', content: `📄 Auto-checkpoint: ${researchBuffer.length} kaynak bulundu, dosyaya yazılıyor...` });
        try {
          const partialHtml = await this._buildFinalHtml(taskDescription, '', researchBuffer);
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

      const res = await fetch(`${this.apiBase}/api/chat`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: AGENT_TOOLS,
          stream: false,
          options: { temperature: 0.2, num_predict: Math.max(this.maxTokens, 8192) }
        })
      });

      if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const assistantMsg = data.message;

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
              const html = await this._buildFinalHtml(taskDescription, result, researchBuffer);
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
          const retryRes = await fetch(`${this.apiBase}/api/chat`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({
              model: this.model, messages, tools: AGENT_TOOLS, stream: false,
              options: { temperature: 0.2, num_predict: this.maxTokens }
            })
          });
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
                messages.push({ role: 'tool', content: JSON.stringify(tSan) });
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
        this._bgMsg('SAVE_TASK_HISTORY', {
          task: taskDescription, result, log, messages, success: true
        }).catch(() => {});
        return { success: true, result, log, messages };
      }

      this._notify({ type: 'AGENT_THOUGHT', content: assistantMsg.content || '' });

      // Execute each tool call
      for (const tc of assistantMsg.tool_calls) {
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
          if (['dom_get_text', 'dom_extract', 'dom_query_all', 'page_get_info'].includes(toolName) && toolResult) {
            let snippet = '';
            if (toolResult.text) snippet = toolResult.text;
            else if (toolResult.content) snippet = toolResult.content;
            else if (toolResult.elements) snippet = toolResult.elements.map(e => [e.text, e.href].filter(Boolean).join(' ')).join('\n');
            else if (toolResult.url) snippet = `[${toolResult.title}](${toolResult.url})`;
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

          messages.push({ role: 'tool', content: JSON.stringify(sanitized) });
        } catch (err) {
          toolResult = { error: err.message };
          log.push({ type: 'tool_error', tool: toolName, error: err.message });
          this._notify({ type: 'TOOL_ERROR', tool: toolName, error: err.message });
          messages.push({ role: 'tool', content: JSON.stringify({ error: err.message }) });
        }

        // Check abort signal after each tool execution too
        if (signal?.aborted) {
          this._notify({ type: 'TASK_STOPPED', messages });
          this._bgMsg('SAVE_TASK_HISTORY', {
            task: taskDescription, result: 'Görev kullanıcı tarafından durduruldu.',
            log, messages, success: false
          }).catch(() => {});
          return { success: false, error: 'Durduruldu', log, messages };
        }
      }
    }

    // Max iterations — still auto-open file if one was created
    if (activeFileKey && !fileOpened) {
      this._notify({ type: 'AGENT_THOUGHT', content: '⚠ Max iterasyon — dosya içeriği oluşturuluyor...' });
      try {
        if (fileUpdateCount === 0) {
          const html = await this._buildFinalHtml(taskDescription, '', researchBuffer);
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
    }).catch(() => {});
    return { success: false, error: 'Max iterations reached', log, messages };
  }

  // ---- Final HTML Builder (fallback when agent forgot to call file_update) ----
  // Uses research buffer + one extra LLM call to generate HTML from raw findings
  async _buildFinalHtml(taskDescription, agentTextResult, researchBuffer) {
    // Combine research buffer into a readable summary
    const bufferText = researchBuffer
      .map((item, i) => `--- Kaynak ${i + 1}${item.url ? ' (' + item.url + ')' : ''} ---\n${item.text}`)
      .join('\n\n');

    // If we have nothing, use the agent's text result
    const context = bufferText || agentTextResult || '(Araştırma verisi bulunamadı)';

    this._notify({ type: 'AGENT_THOUGHT', content: `📄 ${researchBuffer.length} kaynaktan HTML oluşturuluyor...` });

    try {
      const res = await fetch(`${this.apiBase}/api/chat`, {
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
              content: `Task: "${taskDescription}"\n\nResearch data collected:\n\n${context.slice(0, 12000)}\n\nCreate a complete, visually rich HTML page presenting all the findings above.\n\nRequirements:\n- Inline CSS only (no external files)\n- Gradient header with page title\n- Card grid layout for items (3 columns, responsive)\n- Each card: title, description, source URL as link\n- Modern design: rounded corners, shadows, hover effects\n- Turkish or same language as task\n- Start with <!DOCTYPE html> and include everything in one file\n\nOutput ONLY the HTML code:`
            }
          ],
          stream: false,
          options: { temperature: 0.3, num_predict: 8192 }
        })
      });

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
        return this._bgMsg('DOM_ACTION', { action: 'click', selector: args.selector, tabId });
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

      default:
        throw new Error(`Unknown tool: ${tool}`);
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

    // Screenshot: strip base64, just confirm it was taken
    if (tool === 'tab_screenshot') {
      return { screenshot: 'taken', note: 'Screenshot captured but not sent to context (too large)' };
    }

    // page_get_info: strip full HTML, keep url+title only
    if (tool === 'page_get_info') {
      return { url: result.url, title: result.title };
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

    // dom_get_summary: limit to 20 elements and trim text
    if (tool === 'dom_get_summary' && result.interactive) {
      return {
        url: result.url,
        title: result.title,
        interactive: result.interactive.slice(0, 20).map(el => ({
          tag: el.tag,
          id: el.id,
          name: el.name,
          type: el.type,
          text: (el.text || '').substring(0, 50),
          selector: el.selector
        }))
      };
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
    chrome.runtime.sendMessage({ type: 'AGENT_EVENT', data }).catch(() => {});
  }

  _withSystem(messages) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US');
    const systemPrompt = AGENT_SYSTEM_PROMPT_BASE.replace('[DATE_TIME_INJECTED_HERE]', `Today's date: ${dateStr}\nCurrent time: ${timeStr}`);

    const fullSystem = systemPrompt + (this.systemPrompt ? '\n\n' + this.systemPrompt : '');
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
