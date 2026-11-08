# Verification — 2026-11-08

## Live Mac proof

Raycast was installed from the official macOS download to `~/Applications/Raycast.app`; strict deep code-signature verification and Gatekeeper assessment passed. The existing Raycast configuration and other extensions were preserved. The command was registered through `ray develop` from `~/projects/grok-bots-raycast` and compiled into `~/.config/raycast/extensions/grok-bots/send-message.js`. Its source checkout and the compiled extension remain on the Mac. The development watcher was stopped after verification.

Observed in the actual Raycast UI:

- **Message Grok Bot** loaded Fleet and Goji from the existing CLI.
- An empty message displayed **Write a message first** without sending.
- A harmless acknowledgment-only message was composed for Fleet. It explicitly prohibited tools, jobs and external actions.
- One real send produced **Delivery accepted**, HTTP 200, request ID `raycast-9cb6db21-406e-4775-9e59-edc74f0656b5` at `2026-11-08T05:13:05.074Z`.
- Refresh displayed **Receipt checked — No message was sent** and retained the same ID and accepted state.
- Closing and reopening the command retained the receipt in delivery history.
- **Open Grok Bot** opened the installed native application and closed the Raycast command; WindowServer reported Grok Bot as the top application window.

Independent readback through the existing Mac sender:

```json
{
  "requestId": "raycast-9cb6db21-406e-4775-9e59-edc74f0656b5",
  "bot": "fleet",
  "createdAt": "2026-11-08T05:13:05.074Z",
  "status": "accepted",
  "httpStatus": 200
}
```

The actual **Fleet conversation in Grok Bot** subsequently displayed:

> Raycast connection confirmed. requestId: raycast-9cb6db21-406e-4775-9e59-edc74f0656b5.
>
> This was a receipt-only test. I did not start jobs or take other actions.

That is an observed Bot reply, separately verified from transport acceptance. No general two-way API is claimed. Unrelated background observer activity in Fleet’s conversation was not attributed to this test.

## Video

`evidence/grok-bots-raycast-demo.mp4` is a 37.5-second H.264 MP4, 1500 × 1000, copied to the Linux project and retained on the Mac. It shows actual Mac screen recordings: the native Raycast extension, composing, the real accepted receipt, refreshing without resending, and Fleet’s actual acknowledgment. Idle pauses were cut and typing was accelerated 2×, as captioned. The acknowledgment is a separately recorded close-up of the same request’s reply. No interface was recreated for the video.

ScreenCaptureKit recorded through the already authorized CuaDriver daemon. The published video crops out the surrounding desktop and unrelated conversations. A contact sheet covering every second, plus full-size UI and acknowledgment frames, was visually inspected. No credentials, webhook URLs, raw diagnostics or unrelated private conversation text appear in the published crop. Raw desktop recordings stay on the Mac. Evidence is ignored by Git and is not attached to the repository.

## Automated checks

`npm run check` passed on both Linux (Node 22) and the Mac (Node 24): type checking, all 11 focused tests, ESLint, Prettier and Raycast compilation. The process test launches a real temporary executable; no automated test contacts Grok. GitHub CI repeats the same checks.

Full `ray lint` passed icon, source, formatting and extension-skill validation, but its public Store author lookup returned 404 for `saphid`. This private local extension needs no Store account; `npm run lint` runs ESLint and Prettier directly. No author identity was fabricated and no Store publication is claimed.

At installation, npm reported 14 moderate dependency advisories (6 with dev dependencies omitted), including Raycast CLI’s transitive minimatch glob amplification advisory. These are build-tool dependencies; they are not bundled into the sender logic or used to process Bot messages. Upstream-supported dependency ranges were retained rather than downgrading the Raycast SDK or forcing incompatible major versions. No high or critical advisory was reported.

The concurrent-journal regression failed before serialization and passed after the fix. Journal updates now serialize the complete read–modify–write operation, so a late refresh cannot erase another pending ID.

## Security choices

The existing Mac sender, routines, credentials and source worktree were left intact. The extension uses the fixed local CLI path, shell-free argument arrays, message stdin, a journal written before transmission, matching-ID metadata allowlists, suppressed child stderr and no automatic send retries. It stores no message bodies or secrets. No credential file was read by the implementation, reviewer or recording workflow.
