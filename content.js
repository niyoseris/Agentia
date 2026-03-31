// Agentia Content Script — injected into every page
// Handles recording (event capture) and DOM interaction feedback

(function () {
  'use strict';

  let isRecording = false;
  let recordingId = null;
  let lastScrollTime = 0;
  let highlightEl = null;

  // ---- Message listener from background ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'START_RECORDING':
        startRecording(message.recordingId);
        sendResponse({ ok: true });
        break;

      case 'STOP_RECORDING':
        stopRecording();
        sendResponse({ ok: true });
        break;

      case 'HIGHLIGHT_ELEMENT':
        highlightElement(message.selector);
        sendResponse({ ok: true });
        break;

      case 'PING':
        sendResponse({ ok: true, url: location.href });
        break;
    }
    return true;
  });

  // ---- Recording ----
  function startRecording(id) {
    isRecording = true;
    recordingId = id;
    showBadge('Kayıt Başladı', '#e74c3c');
    attachRecordingListeners();
  }

  function stopRecording() {
    isRecording = false;
    recordingId = null;
    showBadge('Kayıt Durdu', '#27ae60');
    setTimeout(hideBadge, 2000);
    detachRecordingListeners();
  }

  // ---- Event Capture ----
  function attachRecordingListeners() {
    document.addEventListener('click', onRecordClick, true);
    document.addEventListener('input', onRecordInput, true);
    document.addEventListener('change', onRecordChange, true);
    document.addEventListener('keydown', onRecordKeydown, true);
    document.addEventListener('scroll', onRecordScroll, true);
    window.addEventListener('beforeunload', onRecordNavigate, true);
  }

  function detachRecordingListeners() {
    document.removeEventListener('click', onRecordClick, true);
    document.removeEventListener('input', onRecordInput, true);
    document.removeEventListener('change', onRecordChange, true);
    document.removeEventListener('keydown', onRecordKeydown, true);
    document.removeEventListener('scroll', onRecordScroll, true);
    window.removeEventListener('beforeunload', onRecordNavigate, true);
  }

  function onRecordClick(e) {
    if (!isRecording) return;
    const el = e.target;
    if (isAgentiaElement(el)) return;

    const selector = getSelector(el);
    const rect = el.getBoundingClientRect();

    sendEvent({
      type: 'click',
      selector,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      text: el.textContent?.trim().substring(0, 80),
      tag: el.tagName.toLowerCase(),
      timestamp: Date.now()
    });
  }

  function onRecordInput(e) {
    if (!isRecording) return;
    const el = e.target;
    if (isAgentiaElement(el)) return;
    if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
    if (el.type === 'password') return; // Never record passwords

    // Debounce — only send after typing stops for 500ms
    clearTimeout(el.__agentiaTimer);
    el.__agentiaTimer = setTimeout(() => {
      sendEvent({
        type: 'type',
        selector: getSelector(el),
        value: el.value,
        tag: el.tagName.toLowerCase(),
        inputType: el.type,
        timestamp: Date.now()
      });
    }, 500);
  }

  function onRecordChange(e) {
    if (!isRecording) return;
    const el = e.target;
    if (isAgentiaElement(el)) return;

    if (el.tagName === 'SELECT') {
      sendEvent({
        type: 'select',
        selector: getSelector(el),
        value: el.value,
        timestamp: Date.now()
      });
    }
  }

  function onRecordKeydown(e) {
    if (!isRecording) return;
    const importantKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'];
    if (!importantKeys.includes(e.key)) return;
    if (isAgentiaElement(e.target)) return;

    sendEvent({
      type: 'keypress',
      key: e.key,
      selector: getSelector(e.target),
      timestamp: Date.now()
    });
  }

  function onRecordScroll(e) {
    if (!isRecording) return;
    const now = Date.now();
    if (now - lastScrollTime < 500) return; // Debounce scrolls
    lastScrollTime = now;

    sendEvent({
      type: 'scroll',
      y: window.scrollY,
      x: window.scrollX,
      timestamp: Date.now()
    });
  }

  function onRecordNavigate(e) {
    if (!isRecording) return;
    sendEvent({
      type: 'navigate',
      url: location.href,
      timestamp: Date.now()
    });
  }

  function sendEvent(event) {
    chrome.runtime.sendMessage({ type: 'RECORDING_EVENT', payload: { event } }).catch(() => {});
  }

  // ---- Smart Selector Generation ----
  function getSelector(el) {
    if (!el || el === document.body) return 'body';

    // 1. ID (best)
    if (el.id && !el.id.match(/^\d/) && !isDynamic(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }

    // 2. name attribute (for inputs)
    if (el.name && !isDynamic(el.name)) {
      return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    }

    // 3. data-testid or similar stable attributes
    for (const attr of ['data-testid', 'data-id', 'data-cy', 'aria-label']) {
      const val = el.getAttribute(attr);
      if (val) return `[${attr}="${CSS.escape(val)}"]`;
    }

    // 4. Role + text (for buttons/links)
    if (['BUTTON', 'A'].includes(el.tagName)) {
      const text = el.textContent?.trim().substring(0, 40);
      if (text && text.length > 0 && text.length < 40) {
        const tag = el.tagName.toLowerCase();
        // Check uniqueness
        const matches = document.querySelectorAll(`${tag}`);
        const match = Array.from(matches).filter(e => e.textContent?.trim() === text);
        if (match.length === 1) {
          return `${tag}:contains("${text}")`;
        }
      }
    }

    // 5. Class-based (avoid highly dynamic classes)
    const stableClasses = getStableClasses(el);
    if (stableClasses) {
      const sel = `${el.tagName.toLowerCase()}.${stableClasses}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 6. Nth-child path (fallback)
    return getCSSPath(el);
  }

  function isDynamic(str) {
    // Heuristic: contains long numbers or random-looking hashes
    return /[0-9]{4,}/.test(str) || /[a-f0-9]{8,}/i.test(str);
  }

  function getStableClasses(el) {
    if (!el.className || typeof el.className !== 'string') return null;
    const classes = el.className.split(' ')
      .filter(c => c && !isDynamic(c) && c.length < 30);
    return classes.length > 0 ? classes[0] : null;
  }

  function getCSSPath(el) {
    const parts = [];
    let current = el;

    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;

      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(part);
      current = current.parentElement;

      // Stop at a good anchor (id or limited depth)
      if (current?.id && !isDynamic(current.id)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      if (parts.length > 5) break;
    }

    return parts.join(' > ');
  }

  function isAgentiaElement(el) {
    return el?.closest?.('#agentia-badge') !== null;
  }

  // ---- Visual Feedback ----
  let badge = null;

  function showBadge(text, color) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'agentia-badge';
      badge.style.cssText = `
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147483647;
        padding: 8px 14px;
        border-radius: 6px;
        font-family: -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: white;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        pointer-events: none;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(badge);
    }
    badge.textContent = '● ' + text;
    badge.style.backgroundColor = color;
    badge.style.opacity = '1';
  }

  function hideBadge() {
    if (badge) badge.style.opacity = '0';
  }

  // Recording indicator pulse
  setInterval(() => {
    if (isRecording && badge) {
      badge.style.opacity = badge.style.opacity === '1' ? '0.5' : '1';
    }
  }, 800);

  // ---- Element Highlight ----
  function highlightElement(selector) {
    if (highlightEl) {
      highlightEl.remove();
      highlightEl = null;
    }

    const el = document.querySelector(selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    highlightEl = document.createElement('div');
    highlightEl.style.cssText = `
      position: fixed;
      top: ${rect.top - 2}px;
      left: ${rect.left - 2}px;
      width: ${rect.width + 4}px;
      height: ${rect.height + 4}px;
      border: 2px solid #3498db;
      border-radius: 4px;
      background: rgba(52, 152, 219, 0.1);
      z-index: 2147483646;
      pointer-events: none;
      animation: agentia-pulse 1s ease-in-out infinite;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes agentia-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(highlightEl);

    setTimeout(() => {
      highlightEl?.remove();
      highlightEl = null;
    }, 3000);
  }

  // ---- Notify background that content script is ready ----
  chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: location.href }).catch(() => {});

})();
