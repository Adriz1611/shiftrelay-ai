# Incident X-Ray implementation plan

Next.js renders the operator workspace. Agora invokes the same GitHub investigation used by the manual operator action. SQLite stores evidence snapshots and approved action outcomes. X-Ray uses a separate, bounded progress snapshot so partially retrieved evidence cannot replace a durable handover.

1. Publish stages after real GitHub responses. Keep evidence and action receipts in the existing records and reuse authenticated workspace polling.
2. Transform source data into validated React Flow nodes and typed relationships. Keep fixed positions by role and stable IDs by source. Separate confirmed observations, candidate explanations and open questions.
3. Give X-Ray its own workspace view with a custom graph, an evidence inspector and a keyboard-friendly list for narrow screens. Hide secondary findings until expanded. Keep voice and operator approval available in the existing workspace.
4. Verify against the live demo runs and issue, then test navigation, failed requests, reduced motion and the existing flow with Chrome and production checks.

The existing repository name retains the configured integration and evidence links. The historical fixture will link to the earlier actual demo run and remain separate from the open issue used for approval.

## Running the demo

Sign in, start voice, and open **Incident X-Ray**. Ask "What changed between the last passing checkout build and this failure?" The manual **Investigate** button exercises the same backend without starting audio. Select the validator output, the commit diff, and the dashed hypothesis to show how the evidence supports it. Select the earlier issue to open its cited workflow. Return to the workspace for the actual approval.

- [Latest failed run](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44388266493)
- [Earlier passing run](https://github.com/Adriz1611/shiftrelay-checkout-demo/actions/runs/44388214705)
- [Closed rehearsal incident with earlier run evidence](https://github.com/Adriz1611/shiftrelay-checkout-demo/issues/2)

Both investigation entrances write the same progress snapshots. The browser polls only the local server, and graph selection and positions survive updates. Issue matching is a title heuristic, with a separately validated prior run link when the issue cites one. The current voice integration triggers investigation data updates, with canvas manipulation handled by the on-screen controls.

## Voice-guided spotlight

Start a voice session and say "Show me the strongest evidence." X-Ray opens and frames the current incident's verified findings. Agora transcript cues move the active selection from validator output to manifest diff to the working hypothesis when those findings exist. The checkout demo uses caption-level focus; word timing depends on metadata from the provider. The manual Next finding control works without captions, and Exit spotlight or a manual node selection returns control to the operator.

Voice lives in a shared layout provider. Moving between the workspace and X-Ray moves the same mounted voice panel into the floating dock. The dock can reveal the transcript and disable the local microphone independently of agent playback.

A live Chrome test used a prerecorded microphone phrase and the real Agora session. It verified automatic opening, all three caption-driven focus transitions in order, mute state across view changes, and ending the same session from the dock.

## Canvas rendering update

The canvas draws cards as HTML buttons and connections as SVG paths, using pixel coordinates derived from the measured viewport. React Flow's viewport math remains in use. The transform-based canvas renderer was removed after a desktop Chrome recording showed the graph disappearing during and after a voice spotlight. A live replay sampled both states at 250 ms intervals for 35 seconds and found no blank frames.
