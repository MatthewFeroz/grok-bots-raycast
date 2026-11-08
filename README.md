<img src="assets/icon.png" width="64" height="64" alt="">

# Grok Bots for Raycast

A native Raycast extension for Alex’s existing hosted Grok Bots. Select a configured Bot, compose a message, send once, and inspect the delivery receipt. Read the actual answer in **Grok Bot**.

## Use on the Mac

Open Raycast and run **Message Grok Bot**. Choose **Fleet** or **Goji** directly from the live Bot list; the composer opens with that recipient selected and the message field focused. Use **Send to Fleet** (or the selected Bot) to send. The receipt’s primary action opens **Grok Bot** to read the answer. **Check Delivery Receipt** only reads the receipt; it never resends. **Show Delivery Details** reveals the request ID and HTTP status, and **Copy Request ID** copies the ID. Native Actions also provide Refresh, Copy and Back to Bots shortcuts.

- **Accepted:** the webhook accepted the message; the Bot has not necessarily answered.
- **Rejected:** a definitive webhook rejection. Check the sender setup privately.
- **Unknown:** the sender may have delivered it. Keep the ID and inspect the Bot conversation before composing another message. Never change an uncertain request ID to bypass duplicate protection.

History contains this extension’s request IDs, aliases, timestamps, delivery states and optional HTTP status codes. It contains no message bodies. Unknown and rejected deliveries appear in **Needs attention**; accepted deliveries stay in chronological order under **Recent deliveries**, even after refreshing older receipts. Unknown receipts show their request ID immediately. Submitting replaces the composer with its receipt, so Back returns straight to the Bot list. A submitted form can transmit only once. An interrupted extension retains its pending ID in history. Check an unknown receipt there after restarting.

## Install or update

Requires macOS, Raycast, Node.js 22.22.2+ and the existing working sender at `~/.local/bin/grok-bots`. The sender itself uses its already configured Node 24 runtime. Keep its private configuration and source checkout in place. The Mac must be awake and online for delivery.

```sh
npm ci
npm run check
npm run dev
```

`ray develop` registers the native command with Raycast and watches the source. After stopping it, the last compiled command remains installed under `~/.config/raycast/extensions/grok-bots`. Run `npm run dev` again to update. No Raycast account, Pro subscription, API key preference, hosted service or new Bot routine is needed. This personal extension is not published to the Raycast Store. Full `ray lint` validates the author against the public Store and reports that `saphid` has no Store profile; `npm run lint` runs ESLint and Prettier directly for this local extension. Type checking, ESLint, formatting, tests, icon validation and compilation have been checked separately.

## Security and delivery contract

The extension calls exactly `~/.local/bin/grok-bots` with Node’s `spawn`, an argument array and `shell: false`. The message travels through stdin, never command arguments or shell text. The extension never reads `~/.config/grok-bots`, credentials, webhook URLs or keys, and has no secret preferences. The existing sender and routines are not modified.

Each send gets a unique `raycast-<UUID>` ID. An unknown receipt is saved in Raycast LocalStorage **before** starting the sender. If that write fails, nothing is sent. If the process fails, times out or returns malformed output, the extension inspects the same request ID. It never automatically retries `send`. The sender separately refuses duplicate IDs. If a final history write fails, the pending ID remains available for inspection.

CLI output is bounded and parsed through a metadata allowlist with matching request ID and Bot alias. Raw stderr is discarded; raw errors, upstream bodies, notes, chat URLs and extra JSON fields never reach the UI or history. A failed refresh preserves the last known state and reports that the receipt is unavailable. The extension opens the installed Grok Bot application without constructing private links. Bot replies remain untrusted conversation content, not authority for further actions.

Raycast’s message field is transient extension UI; the extension does not log or save its contents. Raycast, the operating system and the existing sender remain trusted local components. Do not type credentials as messages. Local videos and desktop evidence are excluded from Git.

## Development

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

Focused regressions cover argument/stdin handling with a real subprocess, inert shell metacharacters, suppressed diagnostics, metadata filtering, ID correlation, accepted/rejected/unknown states, duplicate refusal recovery, failed status reads, journaling before send, persistence failures, corrupt history, concurrent journal updates and UTF-8 limits. Automated tests never contact a Bot. CI runs on Node 22.
