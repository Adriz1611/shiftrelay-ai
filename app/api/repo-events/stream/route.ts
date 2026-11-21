import { authorize } from "@/lib/auth";
import { historyRepository, readRepoEvents } from "@/lib/repo-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await authorize();
  } catch {
    return new Response(null, { status: 401 });
  }
  const repository = historyRepository();
  if (!repository || !process.env.GITHUB_WEBHOOK_SECRET) return new Response(null, { status: 503 });

  const lastId = request.headers.get("last-event-id") ?? "";
  let cursor = /^\d+$/.test(lastId) && Number.isSafeInteger(Number(lastId)) ? Number(lastId) : null;
  const encoder = new TextEncoder();
  let stop: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: string) => controller.enqueue(encoder.encode(frame));
      let closed = false;
      let timer: ReturnType<typeof setInterval>;
      let timeout: ReturnType<typeof setTimeout>;
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", stop);
        controller.close();
      };
      const poll = (opening = false) => {
        if (closed || (!opening && (controller.desiredSize ?? 0) <= 0)) return;
        try {
          const kind = cursor === null ? "issue-replay" : "issue";
          for (const row of readRepoEvents(repository, cursor)) {
            cursor = row.id;
            send(`id: ${row.id}\nevent: ${kind}\ndata: ${JSON.stringify(row.event)}\n\n`);
          }
          cursor ??= 0;
          send(": heartbeat\n\n");
        } catch {
          stop();
        }
      };
      timer = setInterval(() => poll(), 1500);
      timeout = setTimeout(stop, 25_000);
      if (request.signal.aborted) return stop();
      request.signal.addEventListener("abort", stop, { once: true });
      send("retry: 1500\n\n");
      poll(true);
    },
    cancel() {
      try {
        stop?.();
      } catch {
        // The consumer already closed the stream.
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
