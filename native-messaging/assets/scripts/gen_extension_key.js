#!/usr/bin/env node
// Generate a fixed extension key so the Chrome extension ID is deterministic.
//
// What it does:
//   1. Creates an RSA key pair (once). The private key is saved to
//      extension_key.pem next to this script.
//   2. Writes the public key into extension/manifest.json as the "key" field,
//      which pins the extension ID across reloads and store publishing.
//   3. Computes the resulting extension ID and writes it to
//      host/extension_id.txt so install_host.bat can pick it up automatically.
//
// Run from the project root:  node scripts/gen_extension_key.js
//
// IMPORTANT: keep extension_key.pem. Losing it changes the extension ID.
// Do NOT commit it to a public repo.

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const keyPath = path.join(__dirname, "extension_key.pem");
const manifestPath = path.join(root, "extension", "manifest.json");
const idOutPath = path.join(root, "host", "extension_id.txt");

// Chrome derives the ID from SHA-256 of the DER public key:
// take the first 16 bytes, map each nibble 0..15 to letters a..p.
function extensionIdFromDer(der) {
  const hash = crypto.createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0x0f));
  }
  return id;
}

// Reuse an existing key if present so the ID stays stable.
let privateKey;
if (fs.existsSync(keyPath)) {
  privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, "utf8"));
  console.log("Reusing existing key: " + keyPath);
} else {
  const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = pair.privateKey;
  fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log("Created new key: " + keyPath);
}

const publicKey = crypto.createPublicKey(privateKey);
const der = publicKey.export({ type: "spki", format: "der" });
const manifestKey = der.toString("base64");
const extensionId = extensionIdFromDer(der);

// Inject "key" into manifest.json (preserving the rest of the file).
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.key = manifestKey;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// Hand the ID to install_host.bat.
fs.writeFileSync(idOutPath, extensionId);

console.log("");
console.log("Extension ID: " + extensionId);
console.log("Wrote manifest key to: " + manifestPath);
console.log("Wrote ID for installer to: " + idOutPath);
console.log("");
console.log("Next: load the extension in chrome://extensions, then run install_host.bat.");
