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

## Search and Return fix — 2026-11-09

Reproduced the reported `fleet say hi` input in the installed native Raycast command. Fleet and Goji were configured, but native search filtered out every row. The unconditional empty view falsely said **No Bots configured**. Return ran **Reload Bots**, leaving the same empty search.

The updated command recognizes an exact configured alias followed by message text. Native verification showed a Fleet row with **Review typed message, then send**; Return opened Fleet’s composer with `say hi` filled in. It did not submit. The composer displays **Send to Fleet — ⌘↵**. Back cleared the search. An unmatched search displayed **No matching Bots or deliveries** and Return on **Clear Search** restored Fleet, Goji and history. Alias-only `goji` still used native filtering and opened Goji’s composer with its empty-field placeholder.

No message was sent during this fix’s verification. Sender/configuration, credentials, receipt journaling and the single-submit guard are unchanged. The new query text remains transient and is cleared when the composer opens. The focused query regressions reject unknown aliases and alias prefixes, preserve message punctuation/newlines, and cover case-insensitive aliases. A regression failed with the old search-only behavior. `npm run check` passed on Linux and the Mac: **14 tests passed, 0 failed**, type checking, lint, formatting and native compilation green. Independent Sol review approved with no findings.

Native screenshots and verification logs are local under `evidence/query-*` on the Mac. The composer screenshot is also copied to this checkout’s `evidence/query-after-compose.png`. Desktop automation used background input in the scoped Raycast window; Raycast’s floating main window is layer 8 and is absent from the driver’s layer-0 window list.
