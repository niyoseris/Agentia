// DOM action handler

import { getActiveTabId } from './utils.js';

export async function handleDomAction(payload, tabId) {
  const { action } = payload;

  // Guard: can't inject scripts into chrome:// or extension pages
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) {
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
      await new Promise(r => setTimeout(r, 1500));
      const refreshed = await chrome.tabs.get(tabId).catch(() => tab);
      const newUrl = refreshed.url || '';
      if (newUrl.startsWith('chrome://') || newUrl.startsWith('chrome-extension://') || newUrl.startsWith('about:')) {
        return { error: `Cannot run DOM actions on internal page (${newUrl}). Use tab_navigate to load a real webpage first.` };
      }
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
      if (err.message?.includes('error page') && attempt < 2) {
        // SPA is still loading — wait and retry
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

    default:
      return { error: `Unknown DOM action: ${action}` };
  }
}