// Agentia XSS watch — MAIN-world alert/confirm/prompt interceptor.
// Injected into the page's MAIN world (not the isolated content-script world) so
// it overrides the REAL window.alert that XSS payloads call. Records fired
// dialogs into sessionStorage so they survive reads and page reloads (a fired
// alert = proof the XSS executed). Registered at document_start for the target
// origin so load-time XSS (reflected/stored rendered on load) is caught too.
(function () {
  if (window.__agentiaXSSWatch) return;
  window.__agentiaXSSWatch = true;

  var KEY = '__agentia_alerts';
  function record(type, msg) {
    try {
      var arr = JSON.parse(sessionStorage.getItem(KEY) || '[]');
      arr.push({ type: type, message: msg == null ? '' : String(msg), url: location.href, ts: Date.now() });
      sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-100)));
    } catch (e) { /* sessionStorage may be blocked; ignore */ }
  }

  try {
    window.alert = function (m) { record('alert', m); };
    window.confirm = function (m) { record('confirm', m); return true; };
    window.prompt = function (m, d) { record('prompt', m); return d == null ? '' : d; };
    // Some payloads use these too
    window.print = (function (orig) { return function () { record('print', ''); }; })(window.print);
  } catch (e) { /* overriding may fail on some hardened pages */ }
})();
