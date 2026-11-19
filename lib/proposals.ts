import { db, remember } from "./records";
import { createHash } from "node:crypto";
import type { investigate } from "./investigate";
type ExecutionOptions = {
  path?: string;
  repository?: string;
  githubToken?: string;
  webhook?: string;
  send?: typeof fetch;
};
function open(path?: string) {
  const d = db(path);
  d.exec(
    "CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL,receipt TEXT)",
  );
  return d;
}
export function prepare(
  evidence: Awaited<ReturnType<typeof investigate>>,
  options: ExecutionOptions = {},
) {
  if (evidence.conclusion !== "failure") return null;
  const issue =
    evidence.candidates.length === 1 ? evidence.candidates[0] : undefined;
  if (evidence.candidates.length > 1) return null;
  const title = "Checkout deployment investigation";
  const body = [
    "Checkout workflow failed: " + evidence.url,
    ...evidence.steps.map((s) => "Failed step: " + s),
    "Root cause remains unconfirmed.",
  ].join("\n");
  const payload = {
    repo: options.repository ?? process.env.GITHUB_REPOSITORY,
    issue: issue?.number,
    title,
    body,
    notification: body,
    evidence,
  };
  const json = JSON.stringify(payload),
    id = createHash("sha256")
      .update(JSON.stringify([payload.repo, evidence.url]))
      .digest("hex");
  const d = open(options.path);
  try {
    d.prepare("INSERT OR IGNORE INTO proposals VALUES(?,?,'pending',NULL)").run(
      id,
      json,
    );
    const stored = d
      .prepare("SELECT payload,state FROM proposals WHERE id=?")
      .get(id)!;
    if (stored.state !== "pending") return null;
    const snapshot = JSON.parse(String(stored.payload));
    return {
      id,
      body: snapshot.body,
      target: snapshot.issue
        ? "Comment on #" + snapshot.issue
        : "Create GitHub issue",
      notification: snapshot.notification,
    };
  } finally {
    d.close();
  }
}
export async function decide(
  id: string,
  approved: boolean,
  retryNotification = false,
  options: ExecutionOptions = {},
) {
  const d = open(options.path);
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  const webhookUrl = options.webhook ?? process.env.DISCORD_WEBHOOK_URL;
  const send = options.send ?? fetch;
  try {
    const change = d
      .prepare("UPDATE proposals SET state=? WHERE id=? AND state=?")
      .run(
        approved ? "executing" : "declined",
        id,
        retryNotification ? "notification_rejected" : "pending",
      );
    if (!change.changes) return "Proposal already processed or unavailable.";

    const row = d
      .prepare("SELECT payload,receipt FROM proposals WHERE id=?")
      .get(id)!;
    const p = JSON.parse(String(row.payload));
    if (!approved) {
      remember(
        {
          evidence: p.evidence,
          state: "declined",
          summary: "Operator declined. No external writes.",
        },
        options.path,
      );
      return "Declined. No external writes.";
    }
    let receipt = String(row.receipt || "");
    function finish(state: string, message: string, discordMessageId?: string) {
      d.prepare("UPDATE proposals SET state=?,receipt=? WHERE id=?").run(
        state,
        receipt,
        id,
      );
      remember(
        {
          evidence: p.evidence,
          state,
          github: receipt,
          retryId: state === "notification_rejected" ? id : null,
          summary: message,
          discordMessageId,
        },
        options.path,
      );
      return message;
    }
    if (p.repo !== repository || !token || !webhookUrl)
      return finish(
        "failed",
        "Missing authorization or integration configuration.",
      );
    try {
      if (!retryNotification) {
        const res = await send(
          "https://api.github.com/repos/" +
            p.repo +
            "/issues" +
            (p.issue ? "/" + p.issue + "/comments" : ""),
          {
            method: "POST",
            redirect: "error",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...(p.issue ? {} : { title: p.title }),
              body: p.body + "\n<!-- shiftrelay:" + id + " -->",
            }),
          },
        );
        if (!res.ok)
          return finish(
            "github_unconfirmed",
            "GitHub did not confirm the write. HTTP " + res.status,
          );
        const gh = await res.json();
        if (!gh.id || !gh.html_url)
          return finish("github_unconfirmed", "GitHub receipt incomplete.");
        receipt = gh.html_url;
        d.prepare("UPDATE proposals SET receipt=? WHERE id=?").run(receipt, id);
      }
      const webhook = new URL(webhookUrl);
      webhook.searchParams.set("wait", "true");
      const response = await send(webhook, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: p.notification,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok)
        return finish(
          response.status >= 400 && response.status < 500
            ? "notification_rejected"
            : "partial",
          "GitHub updated. Discord returned HTTP " + response.status + ".",
        );
      const discord = await response.json();
      if (!discord.id)
        return finish(
          "partial",
          "GitHub updated. Discord delivery unconfirmed.",
        );
      return finish(
        "succeeded",
        "GitHub updated: " +
          receipt +
          " · Discord message " +
          discord.id +
          " · Handover saved.",
        String(discord.id),
      );
    } catch {
      return finish(
        receipt ? "partial" : "github_unconfirmed",
        receipt
          ? "GitHub updated. Discord delivery unknown."
          : "GitHub delivery unknown. Inspect before retrying.",
      );
    }
  } finally {
    d.close();
  }
}
