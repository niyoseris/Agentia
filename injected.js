// Agentia Injected Script — web-accessible resource
// Handles advanced DOM operations that need full page context

(function () {
  'use strict';

  window.__agentia = window.__agentia || {};

  // Drag-and-drop simulation
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

  // File input simulation
  window.__agentia.setFileInput = function (selector, fileName, fileContent, mimeType) {
    const input = document.querySelector(selector);
    if (!input || input.type !== 'file') return { error: 'File input not found' };

    const file = new File([fileContent], fileName, { type: mimeType || 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  };

  // Shadow DOM piercing query
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

  // Scroll to specific coordinates smoothly
  window.__agentia.smoothScrollTo = function (x, y) {
    window.scrollTo({ top: y, left: x, behavior: 'smooth' });
    return { scrolled: true };
  };

  // Get full page text content (for extraction)
  window.__agentia.getPageText = function () {
    return document.body.innerText;
  };

  // Execute arbitrary code (used by agent for custom scripts)
  window.__agentia.ready = true;
})();
