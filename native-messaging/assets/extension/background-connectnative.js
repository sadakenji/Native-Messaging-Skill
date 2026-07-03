// Background service worker. Holds a persistent connectNative Port.
//
// IMPORTANT: connectNative / sendNativeMessage are NOT available in offscreen
// documents (chrome.offscreen) -- calling either there throws
// "TypeError: chrome.runtime.connectNative is not a function". Native
// Messaging can only be used from the service worker itself or a regular
// extension page (popup, options page, etc). If you need a long-lived Port
// that survives popup close, the service worker is the only viable place to
// hold it -- and that is fine: Chrome does not idle-terminate a service
// worker while a native messaging Port is connected, so the usual ~30s MV3
// idle timeout does not apply here.
const HOST_NAME = "com.example.host";

let port = null;
let pending = null; // { resolve, reject } for the single in-flight request
const queue = [];
let processing = false;

function ensurePort() {
  if (port) return port;

  port = chrome.runtime.connectNative(HOST_NAME);

  port.onMessage.addListener((response) => {
    if (pending) {
      pending.resolve(response);
      pending = null;
    }
  });

  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    if (pending) {
      pending.reject(new Error(error ? error.message : "native host disconnected"));
      pending = null;
    }
    port = null;
  });

  return port;
}

function send(request) {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    ensurePort().postMessage(request);
  });
}

// Requests are processed one at a time, waiting for the host's ack before
// sending the next. This keeps exactly one request "in flight" at any
// moment, so if the Port disconnects mid-stream the host can log which
// request it was mid-processing -- the whole reason to prefer connectNative
// over sendNativeMessage for this kind of workload.
async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const { request, respond } = queue.shift();
    try {
      respond(await send(request));
    } catch (e) {
      respond({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
  processing = false;
}

// Callers (popup, content script, etc.) send one request at a time via
// chrome.runtime.sendMessage and get the host's response back directly --
// do not relay this to yet another context and await its response there.
// A relay adds a hop where the awaiting context can idle-terminate before
// the response arrives, which surfaces as "The message port closed before a
// response was received."
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  queue.push({ request, respond: sendResponse });
  processQueue();
  return true; // keep the message channel open for the async reply
});
