#!/usr/bin/env node
// Native Messaging host (Node.js).
// Reads length-prefixed JSON messages from stdin and writes responses to stdout.
// Wire format: 4-byte little-endian length prefix + UTF-8 JSON body.

"use strict";

let buffer = Buffer.alloc(0);
// Tracks the message currently being handled, so that if the browser side
// disconnects mid-processing (see stdin "end" below) we know exactly which
// request was in flight. This is the main payoff of connectNative over
// sendNativeMessage: with connectNative + one-message-at-a-time from the
// extension side, at most one message is ever in flight here.
let inFlight = null;

// Write a single message back to the browser.
function sendMessage(message) {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

// Handle one decoded request and return the response object.
// Replace the body with your own logic. Return undefined to send no reply.
async function handleMessage(message) {
  // Example: echo the request back.
  return { ok: true, echo: message };
}

// Drain the buffer, decoding as many complete messages as are available.
async function drain() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) break; // wait for the rest of the body
    const body = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);

    let message;
    try {
      message = JSON.parse(body.toString("utf8"));
    } catch (e) {
      sendMessage({ ok: false, error: "invalid JSON: " + e.message });
      continue;
    }

    inFlight = message;
    try {
      const response = await handleMessage(message);
      if (response !== undefined) sendMessage(response);
    } catch (e) {
      sendMessage({ ok: false, error: String(e && e.message ? e.message : e) });
    } finally {
      inFlight = null;
    }
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});

// Chrome reliably closes stdin the moment the extension side disconnects
// (normal shutdown or a crash) -- this is what makes connectNative useful
// for detecting abnormal termination. If a message was still being handled,
// log it before exiting (stderr here; swap for a log file in a real host).
process.stdin.on("end", () => {
  if (inFlight) {
    process.stderr.write(
      "disconnected while processing: " + JSON.stringify(inFlight) + "\n"
    );
  }
  process.exit(0);
});
