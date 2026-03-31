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

const AGENT_SYSTEM_PROMPT = `You are Agentia, an agentic browser assistant. You control the user's browser by calling tools. Be efficient and thorough.

## Core Rules
- After tab_navigate, always wait 1500ms before interacting
- Call dom_get_summary ONCE per page to understand the layout — do not repeat it
- Never call page_get_info and dom_get_summary on the same page — pick one
- For links/products: use href values from dom_query_all with tab_navigate instead of dom_click
- When you have enough data to answer a simple question, stop browsing and respond

## File & Report Tasks (MANDATORY PATTERN)
When user asks for a report, guide, list, HTML page, or any document — follow this exact flow:

1. **file_create** — Call IMMEDIATELY as the first step. Create an HTML skeleton with the page title, CSS styling, and empty sections. Save the returned fileKey.
2. **Research** — Browse the web, extract data, collect content.
3. **file_update** — After each source or major finding, call file_update with the FULL accumulated HTML (includes everything gathered so far + new items). Do this progressively — do not wait until the end.
4. **file_open** — Call as the VERY LAST step when research is complete to open the finished page.

Example for "research X and make a page":
- file_create → { fileKey: "agentia_file_123" }  ← skeleton HTML
- tab_navigate → research source 1
- file_update(fileKey, HTML with item 1)
- tab_navigate → research source 2
- file_update(fileKey, HTML with items 1+2)
- ... continue for all sources ...
- file_update(fileKey, final complete HTML)
- file_open(fileKey)  ← opens the finished page

NEVER say "I will create the file now" — call the tool. NEVER skip file_open at the end.

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
  async runTask(taskDescription, tabId, existingMessages = null) {
    let messages;
    if (existingMessages && existingMessages.length > 0) {
      // Continue existing session — append new user turn
      messages = [...existingMessages, { role: 'user', content: taskDescription }];
    } else {
      messages = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT + (this.systemPrompt ? '\n\n' + this.systemPrompt : '') },
        { role: 'user', content: taskDescription }
      ];
    }

    const log = [];
    let iterations = 0;

    this._notify({ type: 'TASK_START', task: taskDescription });

    while (iterations < this.maxToolIterations) {
      iterations++;

      const res = await fetch(`${this.apiBase}/api/chat`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: AGENT_TOOLS,
          stream: false,
          options: { temperature: 0.2, num_predict: this.maxTokens }
        })
      });

      if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const assistantMsg = data.message;

      messages.push(assistantMsg);

      // No tool calls — task complete
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        let result = assistantMsg.content || '';

        // If LLM returned empty content, force a summary response
        if (!result.trim() && iterations > 1) {
          this._notify({ type: 'AGENT_THOUGHT', content: 'Sonuç boş, özet isteniyor...' });
          messages.push({
            role: 'user',
            content: 'Please write your final answer now. Summarize what you found or did, with all details. If you were supposed to create a file, call create_file now.'
          });
          const retryRes = await fetch(`${this.apiBase}/api/chat`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({
              model: this.model,
              messages,
              tools: AGENT_TOOLS,
              stream: false,
              options: { temperature: 0.2, num_predict: this.maxTokens }
            })
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryMsg = retryData.message;
            messages.push(retryMsg);
            // If retry also has tool calls, process them too
            if (retryMsg.tool_calls && retryMsg.tool_calls.length > 0) {
              for (const tc of retryMsg.tool_calls) {
                const tName = tc.function?.name;
                const tArgs = tc.function?.arguments || {};
                this._notify({ type: 'TOOL_CALL', tool: tName, args: tArgs });
                let tResult;
                try {
                  tResult = await this._executeTool(tName, tArgs, tabId);
                } catch (e) {
                  tResult = { error: e.message };
                }
                const tSanitized = this._sanitizeToolResult(tName, tResult);
                this._notify({ type: 'TOOL_RESULT', tool: tName, result: tSanitized });
                messages.push({ role: 'tool', content: JSON.stringify(tSanitized) });
              }
              result = retryMsg.content || '(dosya oluşturuldu)';
            } else {
              result = retryMsg.content || '';
            }
          }
        }

        log.push({ type: 'final', content: result });
        this._notify({ type: 'TASK_COMPLETE', result });
        // Auto-save to task history
        this._bgMsg('SAVE_TASK_HISTORY', {
          task: taskDescription,
          result,
          log,
          messages,
          success: true
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
        } catch (err) {
          toolResult = { error: err.message };
          log.push({ type: 'tool_error', tool: toolName, error: err.message });
          this._notify({ type: 'TOOL_ERROR', tool: toolName, error: err.message });
        }

        // Append tool result as 'tool' role message — sanitize first to avoid context overflow
        messages.push({
          role: 'tool',
          content: JSON.stringify(this._sanitizeToolResult(toolName, toolResult))
        });
      }
    }

    this._bgMsg('SAVE_TASK_HISTORY', {
      task: taskDescription,
      result: 'Max iterasyon limitine ulaşıldı',
      log,
      messages,
      success: false
    }).catch(() => {});
    return { success: false, error: 'Max iterations reached', log, messages };
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
        elements: result.elements.slice(0, 15).map(el => ({
          tag: el.tag,
          id: el.id,
          text: (el.text || '').substring(0, 80),
          href: (el.href || '').substring(0, 120),
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
    if (!this.systemPrompt) return messages;
    return [{ role: 'system', content: this.systemPrompt }, ...messages];
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
