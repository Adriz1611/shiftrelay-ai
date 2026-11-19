# Integration setup

Populate the ignored .env.local on the demo machine. Use the organizer-linked [Windows starter instructions](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs#run-it) to bind an Agora project. NEXT_PUBLIC_AGORA_APP_ID is public. NEXT_AGORA_APP_CERTIFICATE stays on the server. Obtain MURF_API_KEY from the Murf API dashboard and verify MURF_VOICE_ID with that account. Check remaining minutes and all provider allowances before starting a session.

Set GITHUB_REPOSITORY to owner/repository and GITHUB_WORKFLOW_ID to the workflow filename. Configure a dedicated token with Actions read, Contents read and Issues write. Set DISCORD_WEBHOOK_URL to the authorized demo channel. The operator password and SESSION_SECRET are local, high-entropy values. Each voice session gets a server-generated callback token. Configure the externally reachable HTTPS PUBLIC_TOOLS_BASE_URL before live tool testing. Restrict ingress to /api/tools/*. Each operator approval covers the GitHub operation and the specified Discord notification.

## Checkout repair

The dedicated demo repository supports an approved single-file repair PR. The operator previews the revision retrieved from the last passing manifest before approving. GitHub runs the checkout validator on the repair PR and again on main after an explicit merge. **Check repair status** matches runs to the PR head or merge commit. The receipts are shown in X-Ray and included in the handover tool.

For the existing fine-grained token, set Contents and Pull requests to Read and write for the demo repository. Keep Actions read and Issues read/write. No Actions write permission is needed because GitHub triggers validation from repository events. The workflow verifies the manifest.

## Voice workspace controls

Start a new voice session after changing the tools or tunnel URL. Try "Open Incident X-Ray", "Check the latest checkout build", "Show the proposed repair", "Check the repair status", and "Prepare the GitHub and Discord update".

Agora calls authenticated, allowlisted callbacks. They read GitHub or queue a short-lived command for the signed-in workspace. The browser consumes new commands through its existing workspace poll. An investigation opens X-Ray; repair and proposal commands focus the relevant section. Posting to GitHub or Discord and opening a repair PR still require an operator approval click.
