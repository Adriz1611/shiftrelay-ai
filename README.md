# ShiftRelay AI

A voice-first incident workspace for the engineer taking over checkout. Read the [implementation plan](docs/implementation-plan.md), [integration notes](docs/integrations.md), and [verification status](docs/testing.md).

Use Node 22.19+ and the starter's pnpm lockfile. From PowerShell run `npx.cmd pnpm@10 install --frozen-lockfile`, copy `.env.example` to `.env.local`, and run `npm.cmd run dev -- --hostname 127.0.0.1`. Open localhost:3000. Sign in with the configured demo operator password. GitHub investigation and voice have independent provider requirements. Keep the browser local and expose only the tool callback routes after authorizing a tunnel.

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run test:e2e`. Use Chrome for the Playwright checks.

## Agent tooling

[AGENTS.md](AGENTS.md) contains the repository's instructions. [skills-lock.json](skills-lock.json) records the Agora skill source and revision. Install the optional Agora and Impeccable skills locally for agent-assisted development. Their downloaded folders are ignored, and project-owned skills under `.agents/skills/` can be tracked.
