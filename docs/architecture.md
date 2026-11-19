# Architecture decision

Use the Agora Engine Next.js starter at commit 24374411cdd809701e2a39466f4f97d52e23f173. The server uses agora-agents 2.9.0, browser microphone and playback use agora-rtc-sdk-ng 4.24.3, and Next.js 16.2.6 owns operator actions. The five-minute session config selects reseller Deepgram nova-3, OpenAI gpt-4o-mini, and BYOK Murf FALCON. Account entitlement and provider delivery require live verification.

The operator signs in locally. A signed, expiring HttpOnly cookie protects investigation and approval. Agora calls server-defined read/proposal tools over HTTPS. Tool data and the operator workspace share SQLite. An immutable proposal hash and conditional SQL update protect the write path from repeated clicks or concurrent requests. GitHub's URL survives a Discord failure. SQLite and the application process belong on persistent local disk.

Sources: [starter](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs), [Murf configuration](https://docs.agora.io/en/ai/models/tts/murf), [custom tools](https://docs.agora.io/en/ai/build/tools/custom-tools).
