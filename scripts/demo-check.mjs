import { loadEnvFile } from "node:process";

loadEnvFile(".env.local");

async function check(label, url, expected, headers) {
  const response = await fetch(url, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
  const status = response?.status;
  await response?.body?.cancel();
  console.log(`${label}: ${status === expected ? "OK" : "FAILED"} (${status ?? "unreachable"})`);
  return status === expected;
}

const base = new URL(process.env.PUBLIC_TOOLS_BASE_URL);
if (base.protocol !== "https:") throw new Error("The callback URL must use HTTPS.");
const repo = process.env.GITHUB_REPOSITORY;
const workflow = process.env.GITHUB_WORKFLOW_ID;
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !workflow)
  throw new Error("Configure the GitHub repository and workflow.");

const results = await Promise.all([
  check("Local workspace", "http://127.0.0.1:3000/workspace", 200),
  check("Local callback proxy", "http://127.0.0.1:3189/api/tools/status", 401),
  check("Public spotlight callback", new URL("/api/tools/investigate_and_spotlight", base), 401),
  check("Public issue callback", new URL("/api/tools/explain_issue?number=1", base), 401),
  check("Public workspace blocked", new URL("/", base), 404),
  check("GitHub workflow read", `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=1`, 200, {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }),
]);
process.exitCode = results.every(Boolean) ? 0 : 1;
