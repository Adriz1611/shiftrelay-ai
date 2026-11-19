# ShiftRelay judge Q&A

**Why use voice?** An engineer can ask for an investigation while looking at logs or coordinating a response. The workspace supplies reviewable evidence and the exact approval controls. A new shift can ask for what happened and what to check next.

**Where is Agora used?** Agora RTC carries microphone and agent audio. Agora Conversational AI runs speech recognition, the LLM and the calls to scoped HTTPS tools. Live Agora signaling drives the browser transcript.

**Where is Murf used?** The Agora agent explicitly configures a Murf key, voice and FALCON model selector. A live reply was heard. To establish provider-side provenance, pair a short rehearsal with a redacted Murf usage or request record from the account.

**How does an answer become an action?** GPT-4o mini chooses a read or proposal tool. ShiftRelay validates the session, reads GitHub, and prepares the proposed changes. A signed-in operator has to approve before the server can post.

**Which systems change?** Approval posts a GitHub issue comment or creates a new issue, sends a Discord webhook message, and stores the decision and receipts in SQLite.

**What happens when a tool fails?** GitHub success remains recorded if Discord fails. An explicit Discord rejection can be retried separately. An uncertain delivery stays marked for operator inspection.

**What survives a new session?** The handover is loaded from SQLite, including the failed step, recorded actions and remaining uncertainty. Later investigation reads do not hide the latest completed decision from the handover tool.

**What makes this different from a chatbot?** The agent checks a real deployment, presents evidence and a pending decision, and can produce changes with receipts. The recorded outcome is available after ending the conversation.

**What would production require?** Tenant isolation, SSO, rate limits, durable background execution and reconciliation, managed secrets, observability, and a retention policy.
