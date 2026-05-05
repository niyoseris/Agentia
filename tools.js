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
      name: 'tab_screenshot',
      description: 'Take a screenshot of the current tab. Returns image data for vision-capable models (llava, llama3.2-vision, etc.). Use this to visually inspect the page before interacting with elements.',
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
          topic: { type: 'string', description: 'Category or topic, e.g. "Twitter posting", "user language preference", "Amazon product search"' },
          info: { type: 'string', description: 'The information to remember, e.g. "User prefers Turkish language responses", "Twitter login uses contenteditable"' }
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
      description: 'Search the web using DuckDuckGo. Returns a list of search results with titles, URLs, and snippets. Use this instead of navigating to search engines manually.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query, e.g. "best restaurants in Istanbul" or "been.bio personal travel biography"' },
          maxResults: { type: 'number', description: 'Maximum number of results to return (default: 8, max: 15)' }
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
  }
];