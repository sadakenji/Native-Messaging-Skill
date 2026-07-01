// Popup UI. Sends a message to the background worker, which relays it to the host.
document.getElementById("send").addEventListener("click", () => {
  const out = document.getElementById("out");
  out.textContent = "...";
  chrome.runtime.sendMessage({ text: "hello", at: Date.now() }, (response) => {
    if (chrome.runtime.lastError) {
      out.textContent = "Error: " + chrome.runtime.lastError.message;
      return;
    }
    out.textContent = JSON.stringify(response, null, 2);
  });
});
