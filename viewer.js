// viewer.js — Agentia file viewer logic (extracted from inline to comply with MV3 CSP)

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

  const data = await chrome.storage.local.get(fileKey);
  const file = data[fileKey];

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

function render(isUpdate = false) {
  const area = document.getElementById('content-area');

  if (fileType === 'html') {
    // ── HTML: Blob URL iframe (bypasses extension CSP — styles/scripts work) ──
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const blob = new Blob([rawContent], { type: 'text/html;charset=utf-8' });
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
      htmlIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
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
    area.innerHTML = '<div class="md">' + markdownToHtml(rawContent) + '</div>';
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
  area.innerHTML = '<div class="md">' + markdownToHtml(rawContent) + '</div>';
}

function markdownToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, function(_, header, rows) {
      var ths = header.split('|').filter(function(s) { return s.trim(); }).map(function(s) { return '<th>' + s.trim() + '</th>'; }).join('');
      var trs = rows.trim().split('\n').map(function(row) {
        var tds = row.split('|').filter(function(s) { return s.trim(); }).map(function(s) { return '<td>' + s.trim() + '</td>'; }).join('');
        return '<tr>' + tds + '</tr>';
      }).join('');
      return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
    })
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, function(s) { return '<ul>' + s + '</ul>'; })
    .replace(/\n\n/g, '</p><p>')
    .replace(/^([^<\n].+)$/gm, '<p>$1</p>');
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
  var ext = fileType === 'html' ? 'html' : fileType === 'json' ? 'json' : fileType === 'markdown' ? 'md' : 'txt';
  var mime = fileType === 'html' ? 'text/html' : fileType === 'json' ? 'application/json' : 'text/plain';
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

// Wire up toolbar buttons
document.getElementById('btn-copy').addEventListener('click', copyContent);
document.getElementById('btn-download').addEventListener('click', downloadFile);
document.getElementById('btn-close').addEventListener('click', function() { window.close(); });

// Initial load
load();
