# Repository history and live issues

The signed-in Repository Lab uses the repository configured in `GITHUB_REPOSITORY`. The slider moves between recorded GitHub issue events in UTC. The issue map connects each issue to its repository and displays the most recent observed state at the selected point. Opened markers come from issue creation times. Closed and reopened markers come from GitHub’s repository issue events feed or saved webhook deliveries. Each GitHub API feed can return up to three pages of 100 items. The view surfaces capped or failed reads and shows the events it has available. Pull requests are excluded. [GitHub REST issue events](https://docs.github.com/en/rest/issues/events)

The voice command for repository history opens the timeline. The separate incident history command explains closed references in Incident X-Ray.

## Configure live mode

1. Configure `GITHUB_REPOSITORY` and, for private repositories, a server-side `GITHUB_TOKEN` with read permission for repository Issues. Set an independent high-entropy `GITHUB_WEBHOOK_SECRET` in the application's server environment.
2. For a local instance, run `node scripts/repo-webhook-proxy.mjs`. The proxy listens on loopback port 3191 and forwards only `POST /api/repo-events/webhook` to the application on loopback port 3000. Override those ports with `REPO_WEBHOOK_PROXY_PORT` and `REPO_WEBHOOK_UPSTREAM_PORT`. Point a dedicated HTTPS ingress at this proxy. The existing Agora tool callback ingress is separate.
3. With the repository owner's authorization, create a repository webhook with the HTTPS URL ending in `/api/repo-events/webhook`. Set the content type to `application/json`, use the same secret, and subscribe to **Issues**. The signed ping should return HTTP 204. [GitHub webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
4. Open Repository history and enable **Live mode**. A signed issue creation, closure, or reopening for the configured repository is stored in SQLite. The signed-in browser receives stored issue events over a same-origin server-sent event stream. The listener checks for deliveries every 1.5 seconds, and GitHub delivery timing varies. Browser reconnections resume after the last received delivery.

Historical reads work independently of webhook setup. A fresh stream replays the 100 most recent saved deliveries for the configured repository, and historical reads merge that same saved window with the GitHub API feeds. Keep the SQLite database on persistent storage shared by the webhook handler and the event stream.
