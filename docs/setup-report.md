# ShiftRelay AI setup report

## Environment

- Native Windows x64, Windows PowerShell 5.1. WSL is present as a command and distro enumeration returned access denied.
- Verified Codex CLI 0.170.0 via `codex.cmd`. PowerShell blocks the npm `codex.ps1` shim.
- Verified Node.js 22.19.0, npm 11.13.0, and npx availability. pnpm and Yarn were absent from PATH.
- Verified Git 2.56.1.windows.1 and GitHub CLI 2.91.0. GitHub CLI rejected the existing token. No authentication flow was initiated.
- Initialized one local repository on `main`. Git could not read the user-level ignore file. The repository uses its own ignore rules and has no commits or application scaffold.

## MCP and browser testing

Codex lists two enabled user-level MCP configurations. The CLI stores these entries globally.

| Server | Configuration | Verification |
| --- | --- | --- |
| Agora Docs | `https://mcp.agora.io` | The shell could not connect. The MCP documentation query remains unverified. |
| Microsoft Playwright | `cmd.exe /d /c npx.cmd -y @playwright/mcp@latest` | npm registry access returned EACCES and the package was unavailable offline. Chrome and Edge executables were found. MCP startup and navigation remain unverified. |

Open a fresh Codex session to load the MCP changes. When network access is available, verify Agora by asking for the Conversational AI web quickstart, Murf Falcon setup, and HTTPS custom tool calling. Verify Playwright with a navigation and snapshot on its public TodoMVC demo. Playwright MCP drives interactive browser inspection. Playwright Test runs repeatable test suites and can be added with the application. Microphone permissions, RTC, and audible Falcon output need dedicated checks.

- [Agora MCP](https://docs.agora.io/en/introduction/agora-mcp)
- [Agora docs index](https://docs.agora.io/llms.txt)
- [HTTPS custom tools](https://docs.agora.io/en/ai/build/tools/custom-tools)
- [Playwright MCP setup](https://playwright.dev/mcp/installation)
- [TodoMVC demo](https://demo.playwright.dev/todomvc/)

## Skills and scope

Agora's documentation confirms AgoraIO/skills as the source. Impeccable's own documentation confirms Codex support. Shell access to GitHub failed, and the skills installer package was unavailable offline, so the complete installation contents and lifecycle could not be reviewed. Neither requested skill was installed or discovered. Once access is available, inspect installer help and upstream files, then select project scope and Codex. Check whether Agora Skills offers to configure MCP and keep the one existing Agora entry. Verify skill discovery in a new session.

Existing browser testing, frontend, and skill creation skills are available. The current catalog contains no dedicated GitHub workflow, deployment, or security-review skill. GitHub CLI and official documentation cover initial needs. Matt Pocock skills, Ponytail, and GSD were deferred until the specification reveals a concrete gap.

- [Agora Skills](https://docs.agora.io/en/introduction/agora-skills)
- [Agora skill source](https://github.com/AgoraIO/skills)
- [Impeccable setup](https://impeccable.style/tutorials/getting-started/)

**Readiness: READY WITH BLOCKERS.** Local development can start after the specification arrives. Skill installation, live MCP checks, and GitHub authorization are pending.

## November 19 implementation update

The project-local Agora 1.9.0 and Impeccable 4.9.1 skill files are present. Playwright Test runs Chrome successfully. The earlier offline audit above is historical. See implementation-plan.md and testing.md for current application status.
