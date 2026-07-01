// Background service worker. Bridges UI messages to the native host.
// HOST_NAME must match HOST_NAME in install_host.bat / the host manifest.
const HOST_NAME = "com.example.host";

// One-shot request/response. Chrome starts the host, delivers one message,
// waits for one reply, then shuts the host down.
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  chrome.runtime.sendNativeMessage(HOST_NAME, request, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse(response);
  });
  return true; // keep the message channel open for the async reply
});
