import { createServer, request } from "node:http";
import { pipeline } from "node:stream";

const path = "/api/repo-events/webhook";
const maxBytes = 512 * 1024;
const allowedHeaders = ["content-type", "content-length", "x-github-event", "x-github-delivery", "x-hub-signature-256"];

createServer((incoming, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (incoming.method !== "POST" || incoming.url !== path) {
    response.writeHead(404).end();
    return;
  }
  if (Number(incoming.headers["content-length"]) > maxBytes) {
    response.writeHead(413).end();
    return;
  }

  const headers = Object.fromEntries(allowedHeaders
    .filter((name) => incoming.headers[name] !== undefined)
    .map((name) => [name, incoming.headers[name]]));
  const upstream = request({
    hostname: "127.0.0.1",
    port: Number(process.env.REPO_WEBHOOK_UPSTREAM_PORT ?? 3000),
    method: "POST",
    path,
    headers,
    timeout: 7000,
  }, (result) => {
    response.writeHead(result.statusCode ?? 502).end();
    result.resume();
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Timeout")));
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502).end();
  });
  pipeline(incoming, upstream, () => {});
}).listen(Number(process.env.REPO_WEBHOOK_PROXY_PORT ?? 3191), "127.0.0.1");
