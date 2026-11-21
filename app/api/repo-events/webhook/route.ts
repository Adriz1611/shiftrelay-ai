import { historyRepository, matchesWebhookSignature, persistRepoEvent, webhookIssueEvent } from "@/lib/repo-history";

export const runtime = "nodejs";

const maxBytes = 512 * 1024;

export async function POST(request: Request) {
  const repo = historyRepository();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !repo) return new Response(null, { status: 503 });

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return new Response(null, { status: 401 });
  if (!request.headers.get("content-type")?.split(";")[0].trim().match(/^application\/json$/i)) {
    return new Response(null, { status: 415 });
  }
  if (!request.body) return new Response(null, { status: 400 });
  if (Number(request.headers.get("content-length")) > maxBytes) return new Response(null, { status: 413 });

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(chunk.value);
    }
  } catch {
    return new Response(null, { status: 400 });
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks, size);
  if (!matchesWebhookSignature(body, signature, secret)) return new Response(null, { status: 401 });
  if (request.headers.get("x-github-event") === "ping") return new Response(null, { status: 204 });
  if (request.headers.get("x-github-event") !== "issues") return new Response(null, { status: 204 });
  const delivery = request.headers.get("x-github-delivery")?.toLowerCase();
  if (!delivery || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(delivery)) {
    return new Response(null, { status: 400 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const event = webhookIssueEvent(payload, repo);
  if (event) {
    try {
      persistRepoEvent(delivery, event);
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  return new Response(null, { status: 204 });
}
