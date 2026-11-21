# ShiftRelay live demo

## Repository walkthrough

After operator sign-in, select **Explore repository**. Ask “What’s on fire?” in the Agora session or type it into the repository command box. Select the failing workflow to inspect its GitHub source. Open **History & live** and scrub to the issue closure. The map uses an icon, state label and color to show the change.

Ask “I have 6 hours this weekend.” Use live GitHub issues. Three hours fits #4 and #5. Six hours adds #6 after its prerequisites. Ask for the contributor guide to inspect the starter issue and files at the verified commit. See [webhook configuration](repo-history.md) for live issue deliveries.

## One-minute judging round

| Time | Operator | Evidence on screen |
| --- | --- | --- |
| 0–15 s | “I just took over checkout. Investigate the latest failure and show me your strongest evidence.” | X-Ray opens and focuses the failed step or the retrieved job output. |
| 15–30 s | Follow the spoken spotlight. Open the source if the judge asks how the agent knows. | Where available, the matching diff and last passing run explain the change. Wider impact stays unknown. |
| 30–45 s | Inspect the proposed issue and Discord update. Approve once if demonstrating a new authorized action. | The actual GitHub comment and Discord delivery receipt show what changed. For an already completed action, show its saved receipts. |
| 45–60 s | Start a fresh conversation. “What should the next engineer know?” | The handover identifies the failed run, completed actions and the next unresolved check. |

If a judge asks whether the repair worked, show the checkout validation comparison. A successful PR check and successful main run are separate milestones. Only describe recovery when the matching main run passed.

## 20-second opening

"I just took over checkout and the deployment is failing. Usually I'd ask the outgoing engineer to reconstruct what changed. Watch me ask once, verify the evidence, and hand off the result."

## Three-minute run

| Time | Say or do | What the judge sees |
| --- | --- | --- |
| 0:00–0:45 | Ask "What changed between the last passing checkout build and this failure?" | A real passing and failing run, the manifest diff, and the matching validator error. |
| 0:45–1:25 | Review the pending action. If approved for this demo, click Approve actions once. | The GitHub comment and Discord delivery become checkable receipts. |
| 1:25–2:15 | End the conversation. Start a fresh session and ask "What should the next engineer know?" | The saved handover links evidence, work already done, and the next check. |
| 2:15–2:45 | Expand **Recovery rehearsal · simulated** and run it. | A simulated Discord rejection followed by a Discord-only retry. One GitHub write is counted across both attempts. |
| 2:45–3:00 | Close with "The next shift starts from evidence and receipts, without reconstructing the incident." | The handover stays on screen. |

## Proof links

- [Passing run 44848187507](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44848187507)
- [Failing run 44848250269](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44848250269)
- [Manifest diff](https://github.com/Adriz1611/shiftrelay-checkout-demo/compare/04df656...f572c74)
- [Open incident #1](https://github.com/Adriz1611/shiftrelay-checkout-demo/issues/1)

The repository is private. Show the evidence in a signed-in screen recording or live browser. If the live proposal has already run, use its existing receipt and the fresh-session handover. Keep the simulated recovery label visible.
# Voice rehearsal checks

Run `node scripts/demo-check.mjs` from the repository root before rehearsing. It checks the workspace, proxy, public callback routes and GitHub workflow access without creating an Agora session or writing to GitHub or Discord. After changing the proxy script, restart the proxy process. After changing the agent tool definitions, start a fresh voice session.

Ask “Investigate the latest checkout deployment failure and show me the strongest evidence.” Check that X-Ray highlights the actual validator output and manifest comparison from that run. Then ask “What does GitHub issue number one say?” and verify the issue number against the source. Keep a fresh-session handover as the closing beat.
