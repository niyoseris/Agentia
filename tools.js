// Agentia Tool Definitions — Ollama native tool calling schema

export const AGENT_TOOLS = [
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
      description: 'Get the current working tab managed by Agentia (id, url, title). This is the tab Agentia is operating on, not necessarily the tab the user is looking at.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tab_get_all',
      description: 'List open tabs. Returns { agentTabs, otherTabs, focusedTabId } where agentTabs are the tabs YOU opened (each with id, url, title). Use the tabId of any agentTab to act on it — you can work on ANY tab you opened, not just the focused one.',
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
      name: 'tab_screenshot',
      description: 'Take a screenshot of the current working tab managed by Agentia. Returns image data for vision-capable models (llava, llama3.2-vision, etc.). Use this to visually inspect the page before interacting with elements.',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Tab ID (default: Agentia focused tab)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dom_click',
      description: 'Click an element on the page. You can use: (1) CSS selector like "[data-testid=\'btn\']", (2) plain text like "Post" or "Sign In" to find the closest matching button, or (3) x/y coordinates for icon-only buttons.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector, or plain text label like "Post", "Sign In", "Submit" — the system will find the closest matching clickable element' },
          x: { type: 'number', description: 'X coordinate to click at (use with y instead of selector for icon buttons)' },
          y: { type: 'number', description: 'Y coordinate to click at (use with x instead of selector)' },
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
      name: 'pdf_read',
      description: 'Read and extract text from a PDF file. Use this when the current tab shows a PDF — DOM tools (dom_get_text, page_get_info, dom_get_summary) cannot read PDFs. Returns extracted text with page numbers.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the PDF to read (optional — uses current tab URL if omitted)' },
          pages: { type: 'string', description: 'Page range to read, e.g. "1-5" or "all" (default: "all")' },
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
            enum: ['html', 'tool', 'markdown', 'json', 'text'],
            description: 'html = rich visual page/report. tool = interactive page that can make network requests via agentiaHttp() (scanners, API clients). markdown/json/text for plain content.'
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
  },
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: 'Save important information to your long-term memory. Use this when you learn something worth remembering for future conversations — user preferences, site-specific tricks, useful patterns, or facts the user told you to remember.',
      parameters: {
        type: 'object',
        required: ['topic', 'info'],
        properties: {
          topic: { type: 'string', description: 'Short title of the fact, e.g. "Twitter posting", "user language preference", "Amazon product search"' },
          info: { type: 'string', description: 'The information to remember, e.g. "User prefers Turkish language responses", "Twitter login uses contenteditable"' },
          category: { type: 'string', description: 'Optional category to group the fact, e.g. "teknik", "site-kullanımı", "kullanıcı-tercihi", "araştırma-bulgusu", "genel"' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description: 'Search your long-term memory for relevant information from past conversations and tasks. Use this when starting a new task to check if you have prior knowledge that could help.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in memory, e.g. "Twitter", "user preferences", "recipe"' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_save_recipe',
      description: 'Save a sequence of steps for a specific site/task so you can repeat it instantly next time. Use this AFTER successfully completing a multi-step interaction on a website (posting, filling forms, navigating complex UI). The steps should be the MINIMAL sequence that works — no exploration, just the winning path.',
      parameters: {
        type: 'object',
        required: ['site', 'task', 'steps'],
        properties: {
          site: { type: 'string', description: 'Site domain, e.g. "bsky.app" or "twitter.com"' },
          task: { type: 'string', description: 'What you did, e.g. "post a message" or "send DM"' },
          steps: {
            type: 'array',
            description: 'Ordered list of actions that worked',
            items: {
              type: 'object',
              required: ['action', 'selector'],
              properties: {
                action: { type: 'string', description: 'Tool name: dom_click, dom_type, dom_keypress, tab_navigate, wait' },
                selector: { type: 'string', description: 'CSS selector used' },
                value: { type: 'string', description: 'Value for dom_type or URL for tab_navigate' },
                note: { type: 'string', description: 'Brief tip about this step' }
              }
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web. Uses Ollama web search by default (requires an Ollama API key) and falls back to DuckDuckGo if Ollama is unavailable or returns no results. Returns a list of search results with titles, URLs, and snippets. Use this instead of navigating to search engines manually.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query, e.g. "best restaurants in Istanbul" or "been.bio personal travel biography"' },
          maxResults: { type: 'number', description: 'Maximum number of results to return (default: 8, max: 15 for DuckDuckGo, 10 for Ollama)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make a raw HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD) and get the status, headers, and body back. Runs from the extension so there are NO CORS restrictions — you can call APIs, submit forms, fetch JSON/HTML, probe endpoints, or build a scanner. GET is for reading/research; POST/PUT/DELETE change state — use them deliberately. The response body is capped (~1MB read, truncated for you). For authorized security testing follow the active-testing policy.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Full http(s) URL, e.g. "https://api.example.com/v1/users" or "http://localhost:3000/health"' },
          method: { type: 'string', description: 'HTTP method (default GET)', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
          headers: { type: 'object', description: 'Request headers as an object, e.g. {"Authorization": "Bearer x", "Content-Type": "application/json"}' },
          body: { type: 'string', description: 'Request body for POST/PUT/PATCH (send JSON as a stringified string, and set Content-Type accordingly)' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 30000, max 60000)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_save',
      description: 'Download an image from a URL and return a data URL for embedding in HTML reports. The image is NOT saved to disk — it is returned as a base64 data URL that you can use directly in <img src="..."> tags. Only http/https image URLs are supported (max 5MB).',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Full URL of the image to download (http/https only)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_detect',
      description: 'Detect open modals, dialogs, overlays, and popups on the current page. Finds HTML <dialog> elements, Bootstrap modals, Material UI dialogs, cookie consent banners, and custom modal overlays. Returns a list with each dialog\'s type, title/message text, visible buttons, and input fields.',
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
      name: 'dialog_dismiss',
      description: 'Close/cancel a visible dialog or modal. Clicks the Cancel/Close/X/No button, or calls dialog.close() for native HTML dialogs, or presses Escape. Use index from dialog_detect to target a specific dialog.',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: 'Dialog index from dialog_detect result (0 = first dialog). Default: 0.' },
          selector: { type: 'string', description: 'CSS selector for a specific close/dismiss button (optional — auto-detected if omitted)' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_accept',
      description: 'Accept/confirm a visible dialog or modal. Clicks the OK/Confirm/Yes/Submit/Accept button. For prompt-like dialogs, call dialog_fill first then dialog_accept. Use index from dialog_detect to target a specific dialog.',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: 'Dialog index from dialog_detect result (0 = first). Default: 0.' },
          selector: { type: 'string', description: 'CSS selector for a specific accept button (optional — auto-detected if omitted)' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_fill',
      description: 'Fill input fields inside a visible dialog/modal. Use this before dialog_accept for prompt-like dialogs or login forms in modals.',
      parameters: {
        type: 'object',
        required: ['fields'],
        properties: {
          index: { type: 'number', description: 'Dialog index from dialog_detect result (0 = first). Default: 0.' },
          fields: {
            type: 'object',
            description: 'Map of field label/name to value, e.g. {"email": "user@example.com", "password": "secret123"}'
          },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_alert_intercept',
      description: 'Arm an alert/confirm/prompt WATCH on the page — essential for XSS testing. It overrides the page\'s REAL window.alert (in the page\'s own JS world) and records every fired dialog, WITHOUT showing a popup. It persists across reloads/navigation on the same origin (re-installed before the page\'s scripts run), so an XSS that fires on page load is still caught. Arm this BEFORE typing a payload or reloading. Then read results with dialog_get_intercepted — a captured alert is PROOF the XSS executed. Call with intercept:false to stop watching.',
      parameters: {
        type: 'object',
        properties: {
          intercept: { type: 'boolean', description: 'true = start watching (default), false = stop watching and clear.' },
          persist: { type: 'boolean', description: 'Keep watching across reloads/navigation on this origin (default true). Needed to catch XSS that fires on page load.' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_get_intercepted',
      description: 'Read the alert/confirm/prompt dialogs captured since dialog_alert_intercept was armed (including ones fired after a reload). Returns { count, xssConfirmed, alerts:[{type,message,url}] }. If count > 0, an XSS payload actually executed — record it as a CONFIRMED finding with the message as evidence.',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'number' },
          clear: { type: 'boolean', description: 'Clear the buffer after reading. Default: true.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_upload',
      description: 'Upload a file to a file input element on the page. The file content is fetched from a URL (the agent must provide a data URL or publicly accessible URL). Use this for forms that require file uploads.',
      parameters: {
        type: 'object',
        required: ['selector', 'fileName'],
        properties: {
          selector: { type: 'string', description: 'CSS selector for the <input type="file"> element' },
          fileName: { type: 'string', description: 'Name for the file, e.g. "resume.pdf" or "photo.jpg"' },
          content: { type: 'string', description: 'File content as text (for text files) — use this OR url' },
          url: { type: 'string', description: 'URL to fetch file content from (the system will download it)' },
          mimeType: { type: 'string', description: 'MIME type, e.g. "image/png", "application/pdf". Auto-detected from fileName if omitted.' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'local_file_list',
      description: 'List the local files/folders the user has authorized (via the Files panel), or list the contents of an authorized folder. Requires the Agentia side panel to be open. Call with no handleId to see all authorized items.',
      parameters: {
        type: 'object',
        properties: {
          handleId: { type: 'string', description: 'Optional id of an authorized folder to list its entries. Omit to list all authorized items.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'local_file_read',
      description: 'Read the text content of a local file the user authorized. Requires the side panel open. For an authorized folder, pass the relative path.',
      parameters: {
        type: 'object',
        required: ['handleId'],
        properties: {
          handleId: { type: 'string', description: 'Id of the authorized file, or of the folder containing it' },
          path: { type: 'string', description: 'Relative path inside an authorized folder, e.g. "src/index.js" (only for folder handles)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'local_file_write',
      description: 'Write text content to a local file the user authorized (overwrites). Requires the side panel open. For an authorized folder, pass the relative path (created if missing).',
      parameters: {
        type: 'object',
        required: ['handleId', 'content'],
        properties: {
          handleId: { type: 'string', description: 'Id of the authorized file, or of the folder to write into' },
          path: { type: 'string', description: 'Relative path inside an authorized folder (only for folder handles)' },
          content: { type: 'string', description: 'Text content to write' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kb_add_document',
      description: 'Add a document to a knowledge base from researched/collected text. Use this after gathering information the user wants stored in RAG. The document is chunked and embedded automatically.',
      parameters: {
        type: 'object',
        required: ['kbId', 'name', 'text'],
        properties: {
          kbId: { type: 'string', description: 'Target knowledge base id' },
          name: { type: 'string', description: 'A descriptive document title' },
          text: { type: 'string', description: 'The full text content to store' },
          sourceUrl: { type: 'string', description: 'Optional source URL for attribution' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dialog_suppress_beforeunload',
      description: 'Suppress the browser\'s "Are you sure you want to leave this page?" prompt so navigation/automation is not blocked. Call with suppress:true before actions that might trigger it.',
      parameters: {
        type: 'object',
        properties: {
          suppress: { type: 'boolean', description: 'true to suppress (default), false to restore' },
          tabId: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_download',
      description: 'Save a file to the user\'s computer (Downloads folder). Use this when the user asks to save/export content to disk — text, JSON, CSV, HTML, or a file from a URL. Provide either text content, a data URL, or a source URL.',
      parameters: {
        type: 'object',
        required: ['fileName'],
        properties: {
          fileName: { type: 'string', description: 'File name with extension, e.g. "rapor.md", "veri.csv", "sayfa.html"' },
          content: { type: 'string', description: 'Text content to save (use this OR dataUrl OR url)' },
          dataUrl: { type: 'string', description: 'A data: URL to save (for binary content)' },
          url: { type: 'string', description: 'A remote URL whose file should be downloaded' },
          mimeType: { type: 'string', description: 'MIME type for text content, e.g. "text/markdown", "application/json". Defaults to text/plain.' },
          saveAs: { type: 'boolean', description: 'If true, show the OS "Save As" dialog letting the user pick the location (default false = save directly to Downloads)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'quick_report',
      description: 'Generate and open an HTML report from the research collected so far, without stopping the running task. Use this when the user wants a snapshot before the research is fully complete.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kb_search',
      description: 'SEMANTIC search over the user\'s knowledge bases — returns only the top-K most relevant EXCERPTS, not whole documents. Use it to find relevant snippets. If you need the COMPLETE content of a document (e.g. a full payload list, a full checklist, an entire reference to iterate through), use kb_get_document instead — kb_search will only give you a partial slice.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'What to search for, e.g. "return policy", "project deadlines"' },
          topK: { type: 'number', description: 'Maximum number of excerpts to return (default: 8)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kb_list_documents',
      description: 'List documents in the knowledge bases (id, name, kbName). Call with no kbId to list ALL documents across every KB. Use this to discover which document holds the full reference you need, then read it with kb_get_document.',
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string', description: 'Optional: limit to one knowledge base. Omit to list all documents.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kb_get_document',
      description: 'Read the FULL text of a knowledge-base document (all chunks joined). Use this — not kb_search — when you must go through an entire reference exhaustively, such as trying every payload in a payload list or following a complete checklist. Find the docId first with kb_list_documents.',
      parameters: {
        type: 'object',
        required: ['docId'],
        properties: {
          docId: { type: 'string', description: 'The document id from kb_list_documents' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'skill_use',
      description: 'Load the full instructions of a skill listed in the Available Skills section. Call this FIRST when a listed skill matches the current task, then follow the returned instructions.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Exact skill name from the Available Skills list' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'skill_run_macro',
      description: 'Execute a macro skill — a recorded sequence of browser actions (clicks, typing, navigation). Only works for skills marked [macro] in the Available Skills list.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Exact macro skill name from the Available Skills list' },
          adaptive: { type: 'boolean', description: 'Use adaptive replay that recovers from changed selectors (default: true)' }
        }
      }
    }
  }
];