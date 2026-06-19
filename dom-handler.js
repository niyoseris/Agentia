// DOM action handler

import { getActiveTabId } from './utils.js';

export async function handleDomAction(payload, tabId) {
  const { action } = payload;

  // Guard: tab ID must be valid — returns { error } if tab was closed or never existed
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    return { error: `Tab ${tabId} no longer exists — it was closed or navigated away. Try tab_get_active to find a working tab.` };
  }
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    await new Promise(r => setTimeout(r, 1500));
    const refreshed = await chrome.tabs.get(tabId).catch(() => tab);
    const newUrl = refreshed.url || '';
    if (newUrl.startsWith('chrome://') || newUrl.startsWith('chrome-extension://') || newUrl.startsWith('about:')) {
      return { error: `Cannot run DOM actions on internal page (${newUrl}). Use tab_navigate to load a real webpage first.` };
    }
  }

  // Try executing with retry — SPA pages can temporarily show as "error page" while loading
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: executeDomAction,
        args: [payload]
      });
      return results[0]?.result;
    } catch (err) {
      const msg = err.message || '';
      // Stale tab / frame removed
      if (msg.includes('No tab with id') || msg.includes('Frame with ID') || msg.includes('was removed')) {
        return { error: `Tab ${tabId} is no longer available. Call tab_get_active to find the current active tab.` };
      }
      // Protected pages
      if (msg.includes('cannot be scripted') || msg.includes('extensions gallery')) {
        return { error: `Cannot interact with this page — it is a protected browser page. Navigate to a regular website first.` };
      }
      // SPA loading
      if (msg.includes('error page') && attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

function executeDomAction(payload) {
  const { action, selector, value, x, y, key } = payload;

  function findElement(sel) {
    if (!sel) return null;
    // Try as CSS selector first
    let el = document.querySelector(sel);
    if (!el) {
      // Fallback: search by visible text in interactive elements
      const all = document.querySelectorAll('button, a, input, [role="button"], [data-testid], [aria-label]');
      for (const e of all) {
        const text = e.textContent?.trim().toLowerCase() || '';
        const ariaLabel = e.getAttribute('aria-label')?.toLowerCase() || '';
        const testId = e.getAttribute('data-testid')?.toLowerCase() || '';
        const searchLower = sel.toLowerCase();
        if (text.includes(searchLower) || ariaLabel.includes(searchLower) || testId.includes(searchLower)) {
          el = e; break;
        }
      }
    }
    return el;
  }

  switch (action) {
    case 'click': {
      // Coordinate-based click if x/y provided
      if (payload.x !== undefined && payload.y !== undefined) {
        const el = document.elementFromPoint(payload.x, payload.y);
        if (el) {
          el.click();
          return { clicked: true, at: { x: payload.x, y: payload.y }, tag: el.tagName, text: el.textContent?.trim().substring(0, 50) };
        }
        return { error: `No element at coordinates (${payload.x}, ${payload.y})` };
      }
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.click();
      return { clicked: true, tag: el.tagName, text: el.textContent.trim().substring(0, 50) };
    }

    case 'type': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };

      const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';

      if (isContentEditable) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        el.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertText', data: value, bubbles: true, cancelable: true
        }));

        const inserted = document.execCommand('insertText', false, value);

        el.dispatchEvent(new InputEvent('input', {
          inputType: 'insertText', data: value, bubbles: true
        }));

        return { typed: true, method: 'contenteditable', execCommand: inserted, text: value };
      } else {
        el.focus();
        const nativeProto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(nativeProto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: true, method: 'input', text: value };
      }
    }

    case 'clear': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.focus();
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      } else {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
          'value'
        )?.set;
        if (nativeInputValueSetter) nativeInputValueSetter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { cleared: true };
    }

    case 'scroll': {
      if (selector) {
        const el = findElement(selector);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: y || 300, left: x || 0, behavior: 'smooth' });
      }
      return { scrolled: true };
    }

    case 'hover': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return { hovered: true };
    }

    case 'select': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      if (el.tagName === 'SELECT') {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { selected: true };
    }

    case 'keypress': {
      const el = findElement(selector) || document.activeElement;
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      return { keypressed: key };
    }

    case 'get_text': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { text: el.textContent.trim() };
    }

    case 'get_value': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { value: el.value };
    }

    case 'get_attr': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      return { value: el.getAttribute(payload.attr) };
    }

    case 'screenshot_element': {
      const el = findElement(selector);
      if (!el) return { error: `Element not found: ${selector}` };
      const rect = el.getBoundingClientRect();
      return { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } };
    }

    case 'exists': {
      const el = findElement(selector);
      return { exists: !!el };
    }

    case 'query_all': {
      const els = document.querySelectorAll(selector);
      return {
        count: els.length,
        elements: Array.from(els).slice(0, 20).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          text: el.textContent.trim().substring(0, 100),
          href: el.href,
          value: el.value
        }))
      };
    }

    case 'get_dom_summary': {
      const interactive = document.querySelectorAll(':is(a, button, input, select, textarea, [role="button"], [contenteditable="true"], [data-testid], [aria-label]):not(script):not(style)');
      const buttons = [], links = [], inputs = [], other = [];
      const maxItems = 60;
      const seen = new Set();

      // Detect login state — look for PROMINENT auth UI, not just any text match
      // Logged OUT: visible "Sign In" / "Log In" / "Create Account" as primary CTA
      // Logged IN: profile avatar, compose/create button, notifications
      const prominentAuthEl = document.querySelector(
        'a[href*="/login" i], a[href*="/signin" i], a[href*="/sign-up" i], ' +
        'button[data-testid*="sign-in" i], button[data-testid*="login" i], ' +
        '[data-testid="signInButton"], [data-testid="loginButton"]'
      );
      // Heuristic: if a prominent auth link/button exists in the main nav/header, user is logged out
      let isLoggedIn = true;
      if (prominentAuthEl) {
        // Check if it's in a prominent position (nav, header, main content) vs footer
        const inNav = prominentAuthEl.closest('nav, header, [role="navigation"], [role="banner"]');
        const rect = prominentAuthEl.getBoundingClientRect();
        // Visible and in top area of page = likely a main auth CTA
        if (inNav || (rect.top < 400 && rect.width > 40 && rect.height > 20)) {
          isLoggedIn = false;
        }
      }

      for (let i = 0; i < interactive.length && (buttons.length + links.length + inputs.length + other.length) < maxItems; i++) {
        const el = interactive[i];
        // Skip truly invisible elements
        // Note: position:fixed elements have offsetParent===null but ARE visible — check via getBoundingClientRect
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 3 || rect.height < 3) continue;

        // Build a unique selector — prioritize stable attributes
        let sel;
        if (el.id) {
          sel = `#${el.id}`;
        } else if (el.getAttribute('data-testid')) {
          sel = `[data-testid="${el.getAttribute('data-testid')}"]`;
        } else if (el.getAttribute('aria-label')) {
          sel = `[aria-label="${el.getAttribute('aria-label')}"]`;
        } else if (el.name) {
          sel = `[name="${el.name}"]`;
        } else if (el.getAttribute('role')) {
          // Use nth-of-type to disambiguate generic role elements
          const parent = el.parentElement;
          const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName && c.getAttribute('role') === el.getAttribute('role')) : [];
          const idx = siblings.indexOf(el);
          sel = `${el.tagName.toLowerCase()}[role="${el.getAttribute('role')}"]${siblings.length > 1 ? `:nth-of-type(${idx + 1})` : ''}`;
        } else {
          // Fallback: nth-child path (more specific than just tag name)
          const path = [];
          let node = el;
          let depth = 0;
          while (node && node !== document.body && depth < 4) {
            const parent = node.parentElement;
            if (!parent) break;
            const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
            const nth = siblings.length > 1 ? `:nth-child(${Array.from(parent.children).indexOf(node) + 1})` : '';
            path.unshift(node.tagName.toLowerCase() + nth);
            node = parent;
            depth++;
          }
          sel = path.join(' > ');
        }
        if (seen.has(sel)) continue;
        seen.add(sel);

        const text = (el.textContent || '').trim().substring(0, 80);
        // Detect icon-only buttons (SVG inside, no text)
        const hasSvg = el.querySelector('svg, [data-svg], img') !== null;
        const isIconButton = !text && hasSvg;
        const rectInfo = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };

        const entry = {
          tag: el.tagName,
          selector: sel,
          text: text || undefined,
          iconButton: isIconButton || undefined,
          position: rectInfo,
          href: el.href || undefined,
          type: el.type || undefined,
          placeholder: el.placeholder || undefined,
          'aria-label': el.getAttribute('aria-label') || undefined
        };
        // Clean undefined entries
        for (const k of Object.keys(entry)) { if (entry[k] === undefined) delete entry[k]; }

        // Links that act like buttons (compose, post, action FABs) go to buttons
        const textLower = (text + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
        const actionLinkKeywords = ['post', 'compose', 'new post', 'write', 'create post', 'tweet', 'reply', 'share', 'follow', 'like', 'send'];
        if (el.tagName === 'A' && actionLinkKeywords.some(k => textLower.includes(k))) {
          buttons.push(entry);
        } else if (el.tagName === 'A') {
          links.push(entry);
        } else if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
          buttons.push(entry);
        } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) {
          inputs.push(entry);
        } else {
          other.push(entry);
        }
      }
      return {
        url: location.href,
        title: document.title,
        loggedIn: isLoggedIn,
        loginHint: isLoggedIn ? undefined : 'User appears NOT logged in — prominent Sign In / Log In button found in navigation. Ask user to log in first.',
        buttons: buttons.slice(0, 15),
        links: links.slice(0, 20),
        inputs: inputs.slice(0, 15),
        other: other.slice(0, 10)
      };
    }

    case 'wait_for': {
      const el = document.querySelector(selector);
      return { found: !!el };
    }

    case 'extract_data': {
      const result = {};
      if (payload.fields) {
        for (const [key, sel] of Object.entries(payload.fields)) {
          const el = document.querySelector(sel);
          result[key] = el ? el.textContent.trim() : null;
        }
      }
      return result;
    }

    // ── Dialog / Modal Management ──────────────────────────────────

    case 'detect_dialogs': {
      // Find ALL visible overlay/modal/dialog elements on the page
      const dialogs = [];
      const seen = new Set();

      // 1. Native HTML <dialog open>
      for (const d of document.querySelectorAll('dialog[open]')) {
        if (seen.has(d)) continue;
        seen.add(d);
        const rect = d.getBoundingClientRect();
        const buttons = Array.from(d.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'))
          .filter(b => b.offsetParent !== null || b.getBoundingClientRect().width > 0);
        const inputs = Array.from(d.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, select'))
          .filter(i => i.offsetParent !== null || i.getBoundingClientRect().width > 0);
        dialogs.push({
          type: 'native-dialog',
          element: 'dialog[open]',
          index: dialogs.length,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          title: (d.querySelector('h1,h2,h3,h4,header,[role="heading"]') || {}).textContent?.trim() || '',
          text: (d.textContent || '').trim().substring(0, 300),
          buttons: buttons.map(b => ({
            text: (b.textContent || '').trim().substring(0, 50),
            selector: buildSimpleSelector(b)
          })),
          inputs: inputs.map(i => ({
            label: findLabel(i),
            selector: buildSimpleSelector(i),
            type: i.type || i.tagName.toLowerCase(),
            name: i.name || '',
            placeholder: i.placeholder || ''
          }))
        });
      }

      // 2. aria-modal dialogs (Material UI, custom dialogs)
      for (const d of document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) {
        if (seen.has(d)) continue;
        const rect = d.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) continue;
        seen.add(d);
        const buttons = Array.from(d.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'))
          .filter(b => (b.offsetParent !== null || b.getBoundingClientRect().width > 0));
        const inputs = Array.from(d.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, select'))
          .filter(i => (i.offsetParent !== null || i.getBoundingClientRect().width > 0));
        dialogs.push({
          type: 'aria-dialog',
          element: d.getAttribute('role') || 'dialog',
          index: dialogs.length,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          title: (d.querySelector('h1,h2,h3,h4,header,[role="heading"],.modal-title,.dialog-title,.MuiDialogTitle-root') || {}).textContent?.trim() || '',
          text: (d.textContent || '').trim().substring(0, 300),
          buttons: buttons.map(b => ({
            text: (b.textContent || '').trim().substring(0, 50),
            selector: buildSimpleSelector(b)
          })),
          inputs: inputs.map(i => ({
            label: findLabel(i),
            selector: buildSimpleSelector(i),
            type: i.type || i.tagName.toLowerCase(),
            name: i.name || '',
            placeholder: i.placeholder || ''
          }))
        });
      }

      // 3. Common modal/overlay patterns (Bootstrap, custom)
      const modalSelectors = [
        '.modal:not([style*="display: none"])', '.modal.show', '.modal.fade.show',
        '[class*="modal"][class*="visible"]', '[class*="overlay"][class*="visible"]',
        '.MuiDialog-root', '.MuiModal-root',
        '[class*="dialog"][class*="open"]', '[class*="popup"][class*="open"]',
        '.cookie-banner:not([hidden])', '[class*="cookie"]:not([hidden])', '[class*="consent"]:not([hidden])',
        '[class*="toast"]:not([hidden])'
      ];
      for (const sel of modalSelectors) {
        try {
          for (const d of document.querySelectorAll(sel)) {
            if (seen.has(d)) continue;
            const style = window.getComputedStyle(d);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            const rect = d.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 20) continue;
            seen.add(d);
            const buttons = Array.from(d.querySelectorAll('button, [role="button"], a[role="button"], input[type="submit"], input[type="button"]'))
              .filter(b => (b.offsetParent !== null || b.getBoundingClientRect().width > 0));
            const inputs = Array.from(d.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, select'))
              .filter(i => (i.offsetParent !== null || i.getBoundingClientRect().width > 0));
            dialogs.push({
              type: 'overlay-modal',
              element: sel,
              index: dialogs.length,
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
              title: (d.querySelector('h1,h2,h3,h4,header,[role="heading"],.modal-title,.dialog-title') || {}).textContent?.trim() || '',
              text: (d.textContent || '').trim().substring(0, 300),
              buttons: buttons.map(b => ({
                text: (b.textContent || '').trim().substring(0, 50),
                selector: buildSimpleSelector(b)
              })),
              inputs: inputs.map(i => ({
                label: findLabel(i),
                selector: buildSimpleSelector(i),
                type: i.type || i.tagName.toLowerCase(),
                name: i.name || '',
                placeholder: i.placeholder || ''
              }))
            });
          }
        } catch {}
      }

      return { count: dialogs.length, dialogs };
    }

    case 'dismiss_dialog': {
      const index = payload.index || 0;
      const { dialogs } = executeDomAction({ action: 'detect_dialogs' });

      if (index >= dialogs.length) {
        return { error: `Dialog index ${index} not found. Total dialogs: ${dialogs.length}` };
      }

      const dialog = dialogs[index];

      // Strategy 1: custom selector provided
      if (payload.selector) {
        const el = document.querySelector(payload.selector);
        if (el) { el.click(); return { dismissed: true, method: 'custom-selector' }; }
      }

      // Strategy 2: find close/cancel/no button by text
      const dismissKeywords = ['cancel', 'close', 'no', 'dismiss', 'decline', 'reject', 'later', 'x', '✕', '×', 'skip', 'ignore', 'kapat', 'hayır', 'iptal', 'vazgeç'];
      const buttons = document.querySelectorAll('button, [role="button"], a[role="button"], input[type="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || btn.value || '').trim().toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (dismissKeywords.some(k => text === k || text.includes(k) || aria === k || aria.includes(k))) {
          // Only click if the button is visible
          if (btn.offsetParent !== null || btn.getBoundingClientRect().width > 0) {
            btn.click();
            return { dismissed: true, method: 'text-match', text: (btn.textContent || '').trim().substring(0, 30) };
          }
        }
      }

      // Strategy 3: native dialog.close()
      const dialogEl = document.querySelector('dialog[open]');
      if (dialogEl) {
        dialogEl.close();
        return { dismissed: true, method: 'dialog.close()' };
      }

      // Strategy 4: press Escape key
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return { dismissed: true, method: 'escape-key' };
    }

    case 'accept_dialog': {
      const index = payload.index || 0;
      const { dialogs } = executeDomAction({ action: 'detect_dialogs' });

      if (index >= dialogs.length) {
        return { error: `Dialog index ${index} not found. Total dialogs: ${dialogs.length}` };
      }

      const dialog = dialogs[index];

      // Strategy 1: custom selector
      if (payload.selector) {
        const el = document.querySelector(payload.selector);
        if (el) { el.click(); return { accepted: true, method: 'custom-selector' }; }
      }

      // Strategy 2: use the buttons from detect_dialogs — prefer confirm/ok/yes
      const acceptKeywords = ['ok', 'yes', 'confirm', 'accept', 'agree', 'allow', 'continue', 'submit', 'save', 'send', 'tamam', 'evet', 'kabul', 'onayla', 'gönder', 'kaydet'];
      const dialogButtons = dialog.buttons || [];
      // First pass: text match
      for (const b of dialogButtons) {
        const text = (b.text || '').toLowerCase();
        if (acceptKeywords.some(k => text === k || text.includes(k))) {
          if (b.selector) {
            const el = document.querySelector(b.selector);
            if (el) { el.click(); return { accepted: true, method: 'text-match', text: b.text }; }
          }
        }
      }
      // Second pass: first button that looks like confirm (not cancel/close)
      for (const b of dialogButtons) {
        const text = (b.text || '').toLowerCase();
        const isDismiss = ['cancel', 'close', 'no', 'dismiss', 'decline', 'x', '✕', '×', 'skip', 'kapat', 'hayır', 'iptal'].some(k => text === k || text.includes(k));
        if (!isDismiss && b.selector) {
          const el = document.querySelector(b.selector);
          if (el) { el.click(); return { accepted: true, method: 'first-non-dismiss', text: b.text }; }
        }
      }

      // Strategy 3: press Enter key
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      return { accepted: true, method: 'enter-key' };
    }

    case 'fill_dialog': {
      const index = payload.index || 0;
      const { dialogs } = executeDomAction({ action: 'detect_dialogs' });

      if (index >= dialogs.length) {
        return { error: `Dialog index ${index} not found. Total dialogs: ${dialogs.length}` };
      }

      const dialog = dialogs[index];
      const fields = payload.fields || {};
      const filled = [];

      for (const dialogInput of (dialog.inputs || [])) {
        const labelLower = (dialogInput.label + ' ' + dialogInput.name + ' ' + dialogInput.placeholder).toLowerCase();
        for (const [key, value] of Object.entries(fields)) {
          const keyLower = key.toLowerCase();
          if (labelLower.includes(keyLower) || keyLower.includes(labelLower.substring(0, 10))) {
            const el = dialogInput.selector ? document.querySelector(dialogInput.selector) : null;
            if (el) {
              if (el.tagName === 'SELECT') {
                // Try matching option
                const opts = Array.from(el.options);
                const match = opts.find(o => (o.text || '').toLowerCase().includes(String(value).toLowerCase()));
                if (match) {
                  el.value = match.value;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  filled.push({ field: key, value: match.value, method: 'select' });
                }
              } else if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = ['true', 'yes', '1', 'on'].includes(String(value).toLowerCase());
                el.dispatchEvent(new Event('change', { bubbles: true }));
                filled.push({ field: key, value: el.checked, method: el.type });
              } else {
                // Use the native setter approach
                const nativeProto = el.tagName === 'TEXTAREA'
                  ? window.HTMLTextAreaElement.prototype
                  : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(nativeProto, 'value')?.set;
                if (nativeSetter) nativeSetter.call(el, String(value));
                else el.value = String(value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                filled.push({ field: key, value: String(value), method: 'input' });
              }
            }
            break; // Matched — move to next dialog input
          }
        }
      }

      return { filled, count: filled.length };
    }

    case 'alert_intercept': {
      const intercept = payload.intercept !== false; // Default: true
      if (!window.__agentia) window.__agentia = {};
      if (!window.__agentia._alertBuffer) window.__agentia._alertBuffer = [];
      if (!window.__agentia._origAlert) {
        window.__agentia._origAlert = window.alert;
        window.__agentia._origConfirm = window.confirm;
        window.__agentia._origPrompt = window.prompt;
      }

      if (intercept) {
        window.alert = function (msg) {
          window.__agentia._alertBuffer.push({ type: 'alert', message: String(msg || ''), time: Date.now() });
        };
        window.confirm = function (msg) {
          const result = payload.autoConfirm !== false; // Default: true
          window.__agentia._alertBuffer.push({ type: 'confirm', message: String(msg || ''), autoResponse: result, time: Date.now() });
          return result;
        };
        window.prompt = function (msg, defaultText) {
          const result = payload.autoPrompt || '';
          window.__agentia._alertBuffer.push({ type: 'prompt', message: String(msg || ''), autoResponse: result, time: Date.now() });
          return result;
        };
        return { intercepted: true, note: 'alert/confirm/prompt now auto-handled. Calls recorded in buffer.' };
      } else {
        // Restore originals
        if (window.__agentia._origAlert) window.alert = window.__agentia._origAlert;
        if (window.__agentia._origConfirm) window.confirm = window.__agentia._origConfirm;
        if (window.__agentia._origPrompt) window.prompt = window.__agentia._origPrompt;
        return { restored: true, note: 'Original alert/confirm/prompt restored.' };
      }
    }

    case 'get_alert_buffer': {
      if (!window.__agentia || !window.__agentia._alertBuffer) {
        return { count: 0, alerts: [] };
      }
      const alerts = [...window.__agentia._alertBuffer];
      if (payload.clear !== false) {
        window.__agentia._alertBuffer = [];
      }
      return { count: alerts.length, alerts: alerts.slice(-20) };
    }

    case 'set_file_input': {
      const el = document.querySelector(selector);
      if (!el) return { error: `File input not found: ${selector}` };
      if (el.type !== 'file') return { error: `Element is not a file input (type=${el.type})` };

      let content = payload.content || '';
      let fileName = payload.fileName || 'file.txt';
      let mimeType = payload.mimeType;

      // Auto-detect MIME from extension
      if (!mimeType) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mimeMap = {
          pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
          txt: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'application/xml',
          html: 'text/html', css: 'text/css', js: 'text/javascript',
          zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
        mimeType = mimeMap[ext] || 'application/octet-stream';
      }

      // If content is base64 encoded (from background fetch), decode it
      if (payload.isBase64) {
        try {
          const binary = atob(content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          content = bytes.buffer;
        } catch (e) {
          // If decode fails, use as-is
        }
      }

      const file = new File([content], fileName, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { uploaded: true, fileName, mimeType, size: content.byteLength || content.length };
    }

    default:
      return { error: `Unknown DOM action: ${action}` };
  }

  // ── Helper: find label text for an input ────────────────────────
  function findLabel(el) {
    if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.placeholder) return el.placeholder;
    // Check preceding sibling or parent for label text
    const prev = el.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.textContent?.trim().length < 60)) return prev.textContent.trim();
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.replace(el.textContent || '', '').trim();
    return '';
  }

  // ── Helper: build a simple unique selector ──────────────────────
  function buildSimpleSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.getAttribute('data-testid')) return `[data-testid="${CSS.escape(el.getAttribute('data-testid'))}"]`;
    if (el.getAttribute('aria-label')) return `[aria-label="${CSS.escape(el.getAttribute('aria-label'))}"]`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.split(' ').filter(c => c && c.length > 1 && c.length < 40)[0];
      if (cls) {
        const sel = `${el.tagName.toLowerCase()}.${CSS.escape(cls)}`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    // Fallback: nth-child path
    const path = [];
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 3) {
      const parent = node.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
      const nth = siblings.length > 1 ? `:nth-child(${Array.from(parent.children).indexOf(node) + 1})` : '';
      path.unshift(node.tagName.toLowerCase() + nth);
      node = parent;
      depth++;
    }
    return path.join(' > ');
  }
}