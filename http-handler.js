// Raw HTTP request handler — GET/POST/etc. from the service worker.
// The SW has <all_urls> host permission, so these requests are not subject to
// page CORS. Used by the http_request tool and the type:'tool' viewer bridge.
// Bounded: timeout + response-size cap. Errors are returned (not thrown) so the
// agent loop can continue.

const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 60000;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB read cap
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

// Content types we return as text; anything else is reported as binary metadata
function isTextual(contentType) {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('text/') || ct.includes('json') || ct.includes('xml') ||
         ct.includes('javascript') || ct.includes('html') || ct.includes('csv') ||
         ct.includes('x-www-form-urlencoded') || ct === '';
}

export async function handleHttpRequest(payload = {}) {
  const method = String(payload.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { error: `Desteklenmeyen HTTP metodu: ${method}` };
  }
  const url = payload.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return { error: 'Geçerli bir http(s) URL gerekli' };
  }

  const timeout = Math.min(Math.max(1000, payload.timeoutMs || DEFAULT_TIMEOUT), MAX_TIMEOUT);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const init = {
      method,
      headers: (payload.headers && typeof payload.headers === 'object') ? payload.headers : undefined,
      redirect: 'follow',
      signal: controller.signal
    };
    if (payload.body !== undefined && payload.body !== null && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    }

    const res = await fetch(url, init);

    // Collect response headers into a plain object
    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k] = v;
    const contentType = headers['content-type'] || '';

    // Read the body up to the cap (streaming so we never buffer a huge response)
    const reader = res.body?.getReader();
    let received = 0;
    let truncated = false;
    const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BODY_BYTES) {
          chunks.push(value.slice(0, value.length - (received - MAX_BODY_BYTES)));
          truncated = true;
          try { await reader.cancel(); } catch {}
          break;
        }
        chunks.push(value);
      }
    }
    const bytes = chunks.reduce((n, c) => n + c.length, 0);

    const base = {
      url: res.url || url,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers,
      contentType,
      bytes,
      bodyTruncated: truncated
    };

    if (method === 'HEAD') return { ...base, body: '' };

    if (isTextual(contentType)) {
      const merged = new Uint8Array(bytes);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      const body = new TextDecoder('utf-8', { fatal: false }).decode(merged);
      return { ...base, body };
    }
    // Binary content — don't dump bytes into the model context
    return { ...base, binary: true, body: `[binary ${contentType}, ${bytes} bytes]` };
  } catch (err) {
    if (err.name === 'AbortError') return { error: `İstek zaman aşımına uğradı (${timeout}ms)`, url, timeout: true };
    return { error: `HTTP isteği başarısız: ${err.message}`, url };
  } finally {
    clearTimeout(timer);
  }
}
