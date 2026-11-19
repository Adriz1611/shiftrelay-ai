# Credential checklist

Keep values in a local ignored environment file or the selected platform's secret store. Enter dashboard-managed credentials directly in the relevant dashboard. Keep certificates, API keys, and webhook URLs server-side. Share credential status in chat and enter the values locally.

- [ ] Agora account and dedicated project with access to Conversational AI and RTC.
- [ ] Agora App ID for the selected project.
- [ ] Confirm the SDK quickstart and agent startup path before obtaining credentials. If that path uses RTC tokens, follow its token documentation and keep any App Certificate on the server. If it uses the REST API, verify its separate authentication requirements.
- [ ] Murf account and API key if the chosen Falcon path requires a user-supplied key.
- [ ] LLM and ASR provider credentials only if the selected configurations require them.
- [ ] GitHub CLI authorization for development and a dedicated demo repository. If the application calls GitHub REST, use a fine-grained credential scoped to that repository and the operations the spec requires. The existing CLI credential failed validation.
- [ ] Discord incoming webhook for the intended demo channel. Treat its full URL as a secret.
- [ ] Database credentials if a hosted database is chosen.
- [ ] Deployment credentials or platform access if deployment is selected.

Start with the [Agora documentation index](https://docs.agora.io/llms.txt) and [Murf API docs](https://murf.ai/api/docs).
