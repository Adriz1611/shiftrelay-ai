import { createServer } from "node:http";

const paths = new Set([
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
]);
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" || !paths.has(req.url)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const upstream = await fetch("http://127.0.0.1:3000" + req.url, {
      headers: { authorization: req.headers.authorization ?? "" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(upstream.ok ? await upstream.text() : undefined);
  } catch {
    res.writeHead(502).end();
  }
}).listen(Number(process.env.CALLBACK_PROXY_PORT ?? 3189), "127.0.0.1");
