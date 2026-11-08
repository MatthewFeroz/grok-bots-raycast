# Native UI/UX iteration proof — 2026-11-08

## Installed Mac checks

The installed extension was inspected and improved in five focused changes:

1. Direct Fleet/Goji launcher rows, meaningful status tags, unresolved delivery grouping, and a visible reconnect row even when history exists.
2. A focused message field, preselected recipient, one short privacy/reply note, and a visible Sending state. The result replaces the form, so Back returns to the Bot list rather than a silently spent composer.
3. Open Grok Bot is the receipt’s primary action. Request ID and HTTP diagnostics are available through Show Delivery Details. Check Delivery Receipt only reads the existing ID.
4. Recent history stays ordered by creation time when an old receipt is refreshed. A new regression failed before this fix and passed afterward.
5. Unknown receipts show the recovery ID immediately. Accepted receipts hide routine diagnostics. Native standard Refresh, Copy and New shortcuts are used where available.

A real acknowledgment-only message was sent from the revised Fleet composer. The UI visibly changed to Sending, then to the accepted receipt. The existing CLI independently confirmed:

```json
{
  "requestId": "raycast-b2454920-fddf-4719-8bcc-e5222d74ae8c",
  "bot": "fleet",
  "createdAt": "2026-11-08T06:17:11.215Z",
  "status": "accepted",
  "httpStatus": 200
}
```

Back returned directly to the Bot list with this receipt retained. Show Delivery Details revealed this exact ID. The primary action opened the installed Grok Bot app. This receipt alone does not establish a Bot reply.

Unknown/rejected receipt layouts and a sender-list failure with existing history were checked using temporary synthetic entrypoints rendered inside the actual Raycast app. They were never saved to real history and sent no messages. The original source entrypoint was restored afterward. Credentials, the existing sender executable/configuration, and routines were not changed. No fixture was committed or left installed.

Before/after screenshots and the design audit are in the local design artifact directory:
`/home/saphid/.gstack/projects/grok-bots-raycast/designs/design-audit-20261108/`.

The native Actions menu is a separate WindowServer window. Its AX tree and frame were used to exercise Show Delivery Details with foreground input. AppleScript automation is not authorized; no permission or approval defaults were changed. Screenshot capture of auxiliary Raycast windows can include a scaled main-window composite, so semantic AX frames were used for menu targeting.

## Validation

`npm run check` covers TypeScript, the sender/security regressions, the new history-order regression, ESLint, Prettier and the native Raycast build. The original delivery/security proof and toolchain limitations remain in PROOF.md.

Final `npm run check` passed on Linux and macOS: **12 tests passed, 0 failed**, with type checking, linting, formatting and compilation green. Live installed bundle readback: `Installed bundle exists: True`; `Installed bundle contains test fixtures: False`. Source hashes match the validated Mac copy. An empty composer displayed **Write a message first** without sending.
