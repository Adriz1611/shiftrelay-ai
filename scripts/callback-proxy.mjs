import { createServer } from "node:http";

const paths = new Set([
  "/api/tools/morning_briefing", "/api/tools/sprint_plan", "/api/tools/contributor_guide",
  "/api/tools/repo_history", "/api/tools/repo_health",
  "/api/tools/status",
  "/api/tools/investigate",
  "/api/tools/handover",
  "/api/tools/open_xray",
  "/api/tools/preview_repair",
  "/api/tools/repair_status",
  "/api/tools/review_update",
  "/api/tools/spotlight_evidence",
  "/api/tools/explain_xray",
  "/api/tools/explain_history",
  "/api/tools/explain_issue",
  "/api/tools/investigate_and_spotlight",
]);
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const url = req.url ?? "";
  const queryStart = url.indexOf("?");
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? undefined : url.slice(queryStart + 1);
  if (
    req.method !== "GET" ||
    !paths.has(path) ||
    (query !== undefined && !(
      (path === "/api/tools/explain_issue" && /^number=[1-9]\d{0,9}$/.test(query)) ||
      (path === "/api/tools/sprint_plan" && /^hours=\d{1,3}(?:\.\d{1,2})?$/.test(query))
    ))
  ) {
    res.writeHead(404).end();
    return;
  }
  try {
    const upstream = await fetch("http://127.0.0.1:3000" + req.url, {
      headers: { authorization: req.headers.authorization ?? "" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(upstream.ok ? await upstream.text() : undefined);
  } catch {
    res.writeHead(502).end();
  }
}).listen(Number(process.env.CALLBACK_PROXY_PORT ?? 3189), "127.0.0.1");
