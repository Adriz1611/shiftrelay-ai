# ShiftRelay live demo

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

- [Passing run 44388214705](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44388214705)
- [Failing run 44388266493](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44388266493)
- [Manifest diff](https://github.com/Adriz1611/shiftrelay-checkout-demo/compare/3374fb6...5957f3f)
- [Issue #1 and the previous live comment](https://github.com/Adriz1611/shiftrelay-checkout-demo/issues/1#issuecomment-6989246479)

The repository is private. Show the evidence in a signed-in screen recording or live browser. If the live proposal has already run, use its existing receipt and the fresh-session handover. Keep the simulated recovery label visible.
