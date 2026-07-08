// viewer.js — Agentia file viewer logic (extracted from inline to comply with MV3 CSP)

import { fileStore } from './file-store.js';

const params = new URLSearchParams(location.search);
const fileKey = params.get('key');

let rawContent = '';
let fileType = 'text';
let fileName = 'dosya';
let lastUpdated = 0;
let blobUrl = null;
let htmlIframe = null;
let autoRefreshTimer = null;

async function load(silent = false) {
  if (!fileKey) {
    document.getElementById('content-area').innerHTML =
      '<p style="color:#d63031;padding:24px">Dosya bulunamadı.</p>';
    return;
  }

  const file = await fileStore.getFile(fileKey);

  if (!file) {
    document.getElementById('content-area').innerHTML =
      '<p style="color:#d63031;padding:24px">Dosya silinmiş veya bulunamadı.</p>';
    return;
  }

  // Skip re-render if content hasn't changed (for auto-refresh)
  if (silent && file.updated === lastUpdated) return;

  rawContent = file.content || '';
  fileType = file.type || 'text';
  fileName = file.name || 'dosya';
  lastUpdated = file.updated || file.created || 0;

  document.title = 'Agentia — ' + fileName;
  document.getElementById('file-title').textContent = fileName;

  const updatedAt = file.updated || file.created;
  document.getElementById('file-meta').textContent =
    new Date(updatedAt).toLocaleString('tr-TR') + ' · ' + fileType.toUpperCase();

  render(silent);
}

// Preamble injected into type:'tool' documents so their JS can make HTTP
// requests through the extension (no CORS) via window.agentiaHttp(url, opts).
const TOOL_BRIDGE_PREAMBLE = `<script>
(function(){
  var _id=0,_p={};
  window.addEventListener('message',function(e){
    var m=e.data;
    if(m&&m.__agentiaHttpResp&&_p[m.id]){_p[m.id](m.result);delete _p[m.id];}
  });
  window.agentiaHttp=function(url,opts){
    return new Promise(function(res){var id=++_id;_p[id]=res;parent.postMessage({__agentiaHttpReq:true,id:id,url:url,opts:opts||{}},'*');});
  };
})();
<\/script>
`;

function render(isUpdate = false) {
  const area = document.getElementById('content-area');

  if (fileType === 'html' || fileType === 'tool') {
    // ── HTML/tool: Blob URL iframe (bypasses extension CSP — styles/scripts work) ──
    // 'tool' files additionally get the agentiaHttp bridge preamble.
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const docContent = fileType === 'tool' ? TOOL_BRIDGE_PREAMBLE + rawContent : rawContent;
    const blob = new Blob([docContent], { type: 'text/html;charset=utf-8' });
    blobUrl = URL.createObjectURL(blob);

    if (htmlIframe && isUpdate) {
      // Already exists — just reload src for smooth live-update
      htmlIframe.src = blobUrl;
    } else {
      // First render — create full-page iframe outside content-area
      area.style.display = 'none';
      document.body.style.overflow = 'hidden';

      if (htmlIframe) htmlIframe.remove();

      const wrapper = document.createElement('div');
      wrapper.id = 'html-wrapper';
      wrapper.style.cssText = 'position:fixed;top:52px;left:0;right:0;bottom:0;';
      document.body.appendChild(wrapper);

      htmlIframe = document.createElement('iframe');
      htmlIframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
      htmlIframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
      htmlIframe.src = blobUrl;
      wrapper.appendChild(htmlIframe);
    }

    // Auto-refresh: check every 3s if file was updated by agent
    if (!autoRefreshTimer) {
      autoRefreshTimer = setInterval(function() { load(true); }, 3000);
    }
    return;
  }

  // Non-HTML: restore content-area, clear any HTML wrapper
  area.style.display = '';
  document.body.style.overflow = '';
  const wrapper = document.getElementById('html-wrapper');
  if (wrapper) wrapper.remove();
  htmlIframe = null;

  if (fileType === 'markdown' || fileType === 'md') {
    area.innerHTML = '<div class="md">' + (typeof DOMPurify !== 'undefined' && typeof marked !== 'undefined' ? DOMPurify.sanitize(marked.parse(rawContent)) : escHtml(rawContent)) + '</div>';
    return;
  }

  if (fileType === 'json') {
    try {
      const pretty = JSON.stringify(JSON.parse(rawContent), null, 2);
      area.innerHTML = '<pre>' + escHtml(pretty) + '</pre>';
    } catch (e) {
      area.innerHTML = '<pre>' + escHtml(rawContent) + '</pre>';
    }
    return;
  }

  // Default: treat as markdown-like text
  area.innerHTML = '<div class="md">' + (typeof DOMPurify !== 'undefined' && typeof marked !== 'undefined' ? DOMPurify.sanitize(marked.parse(rawContent)) : escHtml(rawContent)) + '</div>';
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyContent() {
  navigator.clipboard.writeText(rawContent).then(function() {
    var btn = document.querySelector('#btn-copy');
    btn.textContent = '\u2713 Kopyalandı';
    setTimeout(function() { btn.textContent = 'Kopyala'; }, 2000);
  });
}

function downloadFile() {
  var ext = (fileType === 'html' || fileType === 'tool') ? 'html' : fileType === 'json' ? 'json' : fileType === 'markdown' ? 'md' : 'txt';
  var mime = (fileType === 'html' || fileType === 'tool') ? 'text/html' : fileType === 'json' ? 'application/json' : 'text/plain';
  var blob = new Blob([rawContent], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName + '.' + ext;
  a.click();
  URL.revokeObjectURL(url);
}

// Clean up on page unload
window.addEventListener('unload', function() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
});

// ── type:'tool' HTTP bridge ──────────────────────────────────────────────────
// The sandboxed tool iframe (opaque origin) asks the extension to make HTTP
// requests on its behalf. Only serviced for 'tool' files and only from OUR iframe.
window.addEventListener('message', function (e) {
  if (fileType !== 'tool' || !htmlIframe || e.source !== htmlIframe.contentWindow) return;
  const m = e.data;
  if (!m || !m.__agentiaHttpReq) return;
  const opts = m.opts || {};
  chrome.runtime.sendMessage({
    type: 'HTTP_REQUEST',
    payload: { url: m.url, method: opts.method, headers: opts.headers, body: opts.body, timeoutMs: opts.timeoutMs }
  }, function (response) {
    const result = (response && response.success)
      ? response.data
      : { error: (response && response.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'İstek başarısız' };
    try { htmlIframe.contentWindow.postMessage({ __agentiaHttpResp: true, id: m.id, result }, '*'); } catch (err) {}
  });
});

// Wire up toolbar buttons
document.getElementById('btn-copy').addEventListener('click', copyContent);
document.getElementById('btn-download').addEventListener('click', downloadFile);
document.getElementById('btn-close').addEventListener('click', function() { window.close(); });

// Initial load
load();
