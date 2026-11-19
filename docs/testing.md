# Verification ledger

| Check | Evidence |
| --- | --- |
| TypeScript and ESLint | Local checks passed. |
| Production build | Next.js webpack build generated the workspace and HTTPS tool route. |
| Workflow logic | Vitest uses an isolated SQLite file and mocked HTTP. Covered decline, concurrent duplicate approval, success receipts, ambiguous Discord failure and Discord-only retry after explicit rejection. |
| Browser | Two Chrome Playwright checks passed at desktop and mobile widths. Checked heading, unauthorized investigation, unauthorized callback and viewport overflow. |
| Design | Desktop screenshot inspected. Blush surfaces, burgundy primary controls, sparse chartreuse waveform and voice control. |
| Voice and provider integrations | Live microphone, reply, transcript, and scoped callback were verified. Murf-side provenance and voice edge cases remain open. |
| Real-world action | The operator approved a real GitHub comment and Discord notification. Both receipts and the saved handover were verified. |

## Manual acceptance

Verify accepted and denied microphone permissions, session start, speech recognition and transcript, interruptibility, and clean stop. Correlate the configured Falcon session with audible output and Murf-side usage or request evidence. Ask the agent to investigate and inspect the actual tool receipt. Decline once; verify zero writes. In a fresh run approve once, inspect GitHub and Discord, and ask for spoken results. Restart voice and retrieve the saved handover. Disconnect the network and verify honest status. Rehearse a partial failure with an explicitly identified controlled fixture and inspect recovery.

Live demo verified by the operator: voice input, spoken reply, and live Agora transcript. The voice investigation surfaced the failed checkout run and proposal for issue #1. Operator approval posted GitHub comment 6989246479 and Discord message 1572695163053285416. A local database read confirmed a succeeded handover. A subsequent fresh-session reply named the GitHub comment, Discord delivery and unconfirmed cause.

The expanded investigation was checked against the live demo repository. It correctly reported zero previous passing runs on the branch and retained the existing GitHub receipt on reread. Chrome verified that the copy control included the receipt and the unconfirmed root cause. A controlled Web Audio signal verified the meter response at multiple levels and silence.
