// Agentia Injected Script — web-accessible resource
// Loaded into every page via content script for advanced DOM operations
// that need full page context (dialog interception, file input, drag-drop)

(function () {
  'use strict';

  if (window.__agentia && window.__agentia._injected) return; // Already loaded
  if (!window.__agentia) window.__agentia = {};

  window.__agentia._injected = true;

  // ── Alert / Confirm / Prompt Interception ────────────────────────
  window.__agentia._alertBuffer = [];
  window.__agentia._origAlert = null;
  window.__agentia._origConfirm = null;
  window.__agentia._origPrompt = null;

  window.__agentia.interceptAlerts = function (options = {}) {
    if (!window.__agentia._origAlert) {
      window.__agentia._origAlert = window.alert;
      window.__agentia._origConfirm = window.confirm;
      window.__agentia._origPrompt = window.prompt;
    }

    if (options.intercept !== false) {
      const autoConfirm = options.autoConfirm !== false;
      const autoPrompt = options.autoPrompt || '';

      window.alert = function (msg) {
        window.__agentia._alertBuffer.push({
          type: 'alert', message: String(msg || ''), time: Date.now()
        });
      };

      window.confirm = function (msg) {
        window.__agentia._alertBuffer.push({
          type: 'confirm', message: String(msg || ''), autoResponse: autoConfirm, time: Date.now()
        });
        return autoConfirm;
      };

      window.prompt = function (msg, defaultText) {
        window.__agentia._alertBuffer.push({
          type: 'prompt', message: String(msg || ''), defaultText: defaultText || '', autoResponse: autoPrompt, time: Date.now()
        });
        return autoPrompt;
      };
    } else {
      // Restore originals
      if (window.__agentia._origAlert) window.alert = window.__agentia._origAlert;
      if (window.__agentia._origConfirm) window.confirm = window.__agentia._origConfirm;
      if (window.__agentia._origPrompt) window.prompt = window.__agentia._origPrompt;
    }
  };

  window.__agentia.getAlertBuffer = function (clear = true) {
    const alerts = [...window.__agentia._alertBuffer];
    if (clear) window.__agentia._alertBuffer = [];
    return alerts;
  };

  // ── beforeunload suppression ─────────────────────────────────────
  // Prevent "Are you sure you want to leave?" dialogs from blocking navigation
  window.__agentia._beforeUnloadBlocked = false;

  window.__agentia.suppressBeforeUnload = function (suppress = true) {
    if (suppress && !window.__agentia._beforeUnloadBlocked) {
      window.__agentia._beforeUnloadBlocked = true;
      window.addEventListener('beforeunload', function (e) {
        // Don't prevent — just don't set returnValue which suppresses the dialog
        // The page's own handler may have set it; we clear it
        e.returnValue = undefined;
        delete e.returnValue;
      }, true);
    }
  };

  // ── Drag-and-drop simulation ─────────────────────────────────────
  window.__agentia.dragDrop = function (sourceSelector, targetSelector) {
    const source = document.querySelector(sourceSelector);
    const target = document.querySelector(targetSelector);
    if (!source || !target) return { error: 'Element not found' };

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const events = [
      new MouseEvent('mousedown', { bubbles: true, clientX: sourceRect.x + sourceRect.width / 2, clientY: sourceRect.y + sourceRect.height / 2 }),
      new DragEvent('dragstart', { bubbles: true }),
      new DragEvent('drag', { bubbles: true }),
      new DragEvent('dragenter', { bubbles: true }),
      new DragEvent('dragover', { bubbles: true }),
      new DragEvent('drop', { bubbles: true }),
      new DragEvent('dragend', { bubbles: true }),
      new MouseEvent('mouseup', { bubbles: true })
    ];

    source.dispatchEvent(events[0]);
    source.dispatchEvent(events[1]);
    source.dispatchEvent(events[2]);
    target.dispatchEvent(events[3]);
    target.dispatchEvent(events[4]);
    target.dispatchEvent(events[5]);
    source.dispatchEvent(events[6]);
    source.dispatchEvent(events[7]);

    return { success: true };
  };

  // ── File input simulation ────────────────────────────────────────
  window.__agentia.setFileInput = function (selector, fileName, fileContent, mimeType, isBase64) {
    const input = document.querySelector(selector);
    if (!input || input.type !== 'file') return { error: 'File input not found: ' + selector };

    // If content is base64 encoded (from background fetch), decode it
    if (isBase64) {
      try {
        const binary = atob(fileContent);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        fileContent = bytes.buffer;
      } catch {
        // If decode fails, use as-is (might be plain text)
      }
    }

    const file = new File([fileContent], fileName, { type: mimeType || 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, fileName, mimeType };
  };

  // ── Shadow DOM piercing query ────────────────────────────────────
  window.__agentia.shadowQuery = function (selectors) {
    function pierceQuery(root, sel) {
      const direct = root.querySelector(sel);
      if (direct) return direct;

      const allEls = root.querySelectorAll('*');
      for (const el of allEls) {
        if (el.shadowRoot) {
          const found = pierceQuery(el.shadowRoot, sel);
          if (found) return found;
        }
      }
      return null;
    }

    const el = pierceQuery(document, selectors);
    if (!el) return null;

    return {
      tag: el.tagName,
      id: el.id,
      text: el.textContent?.trim().substring(0, 100),
      value: el.value
    };
  };

  // ── Scroll helpers ───────────────────────────────────────────────
  window.__agentia.smoothScrollTo = function (x, y) {
    window.scrollTo({ top: y, left: x, behavior: 'smooth' });
    return { scrolled: true };
  };

  window.__agentia.getPageText = function () {
    return document.body.innerText;
  };

  window.__agentia.ready = true;
})();
