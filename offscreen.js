// Agentia offscreen lifeline
// Keeps the service worker alive during long tasks. Two mechanisms:
//  1) A long-lived runtime port to the SW (activity resets the SW idle timer).
//  2) A silent looping WebAudio oscillator (audio playback keeps the context busy).
// The SW opens this document with reason AUDIO_PLAYBACK and closes it when idle.

let port = null;

function connect() {
  try {
    port = chrome.runtime.connect({ name: 'agentia-lifeline' });
    port.onDisconnect.addListener(() => {
      port = null;
      // SW went away; retry shortly so the lifeline reattaches when it respawns
      setTimeout(connect, 1000);
    });
  } catch (e) {
    setTimeout(connect, 1000);
  }
}

// Silent audio to keep an audible-content reason alive without noise
function startSilentAudio() {
  try {
    const ctx = new (self.AudioContext || self.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // fully silent
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
  } catch (e) {
    console.warn('[Agentia offscreen] silent audio failed:', e.message);
  }
}

connect();
startSilentAudio();

// Periodic ping so the SW's message listener keeps firing
setInterval(() => {
  if (port) {
    try { port.postMessage({ type: 'lifeline-ping', ts: Date.now() }); } catch {}
  }
}, 20000);
