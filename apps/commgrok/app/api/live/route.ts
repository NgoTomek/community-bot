// Server-sent events for local demo mode. Watches the local store's version
// counter, so it works no matter which server process made the change.
import { isSupabaseMode } from "@/lib/config";
import { localVersion } from "@/lib/store/local";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (isSupabaseMode()) return new Response("Live updates use Supabase Realtime in this mode", { status: 404 });
  const enc = new TextEncoder();
  let last = localVersion();
  let poll: ReturnType<typeof setInterval> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(poll);
    clearInterval(ping);
  };
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          stop();
        }
      };
      send("retry: 2000\n: connected\n\n");
      poll = setInterval(() => {
        const v = localVersion();
        if (v !== last) {
          last = v;
          send(`data: ${v}\n\n`);
        }
      }, 400);
      ping = setInterval(() => send(": ping\n\n"), 15_000);
      req.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: stop,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
