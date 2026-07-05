# Native Messaging Skill

An [Agent Skill](https://code.claude.com/docs/en/skills) for [Claude Code](https://claude.com/claude-code) that sets up **Chrome extension Native Messaging** on Windows — connecting a Chrome extension to a native host program (Node.js) on the local PC, so the extension can launch programs, work with files, or run OS commands.

Tell Claude Code what your extension should do on the local machine — for example, *"I want my Chrome extension to launch a local app"* — and the skill guides the setup end to end: copying templates, implementing the host, pinning the extension ID, registering the host in the Windows registry, and verifying the round trip.

## What's inside

The skill ships a set of templates (`native-messaging/assets/`) that get copied into your project and customized during setup:

```text
host/
  host.js                       # Native host (Node.js). Wire protocol implemented; you write handleMessage()
  host.bat                      # Wrapper launched by Chrome (Chrome cannot start a .js file directly)
scripts/
  gen_extension_key.js          # Pins the extension ID with an RSA key (recommended, optional)
install_host.bat                # Generates the host manifest + registers it under HKCU
uninstall_host.bat              # Removes the registry entry and the manifest
extension/                      # Minimal MV3 sample extension
  manifest.json
  background.js                 # One-shot messaging (sendNativeMessage)
  background-connectnative.js   # Persistent connection (connectNative) — pick one to use as background.js
  popup.html / popup.js
```

## Highlights

- **Zero-dependency Node.js host.** The Native Messaging wire protocol (4-byte little-endian length prefix + UTF-8 JSON) is already implemented. You only fill in `handleMessage(message)`.
- **Two connection modes.** One-shot `sendNativeMessage` for simple request/response, or a persistent `connectNative` port. The persistent template includes request queueing, one-in-flight ack handling, and disconnect detection — the host logs which message was being processed if the browser side goes away mid-work.
- **Extension ID pinning.** `gen_extension_key.js` generates an RSA key and embeds the public key in `manifest.json`, so the extension ID is known *before* the extension is ever loaded into Chrome and never changes. No manual copy-paste from `chrome://extensions`; `install_host.bat` picks the ID up automatically.
- **Per-user install.** The host manifest is registered under `HKCU` — no administrator rights required.
- **Hard-won guidance baked in.** The reference document covers the MV3 pitfalls that actually cost time: offscreen documents *cannot* call Native Messaging APIs at all, service workers stay alive while a native messaging port is connected, relay patterns that silently drop responses — plus a layer-by-layer isolation procedure and a troubleshooting list.

## Requirements

- Windows (registers under `HKCU\Software\Google\Chrome\NativeMessagingHosts`)
- Google Chrome (Manifest V3)
- Node.js available on `PATH`
- [Claude Code](https://claude.com/claude-code) (or another agent runtime that supports Agent Skills)

## Install the skill

Copy the `native-messaging/` folder into your skills directory:

- User scope: `%USERPROFILE%\.claude\skills\native-messaging`
- Project scope: `<your-project>\.claude\skills\native-messaging`

## Use it

Just mention Native Messaging — or simply the goal, such as having your extension start a local program — in a Claude Code session. The skill triggers automatically and walks through:

1. Choosing a host name (`com.<vendor>.<product>`)
2. Copying the templates into your project
3. Implementing the host logic in `host.js`
4. Choosing the connection mode (one-shot vs. persistent)
5. Pinning the extension ID (key-based, with manual fallback)
6. Loading the extension and running `install_host.bat`
7. Verifying the round trip

## A note on language

`SKILL.md` and the reference documentation are written in **Japanese**. Claude reads them natively, so the skill works no matter which language you converse in. Everything that lands in your project (scripts, templates, code comments) is ASCII-only English — that is also a hard rule of this skill, to avoid Windows code-page issues in `.bat` files.

## Repository layout

| Path | Description |
| --- | --- |
| `native-messaging/` | The Agent Skill itself (`SKILL.md`, `assets/`, `references/`) |
| `References/` | Early reference material from a predecessor project, kept for the record |
| `CLAUDE.md` | Instructions for Claude Code when working on this repository |
| `ChatLog.md` / `ChatLog.html` | Development session logs (Japanese) |

## License

[MIT](LICENSE)
