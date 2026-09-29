import type { APIRoute } from "astro";
import { bus, type PlanChanged } from "../../lib/events";

// The minimal server-sent-events (SSE) pattern: a long-lived streaming
// response the browser consumes with `new EventSource("/api/events")`.
// SSE is one-directional (server → browser) and plain HTTP, which makes it
// the simplest live channel that works everywhere. Here it tells an open
// plan page that the plan changed somewhere else. CI's post-deploy probe
// also reads it, so it has to keep streaming whatever else changes.
export const GET: APIRoute = () => {
  let onPlan: (event: PlanChanged) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onPlan = (event) => {
        controller.enqueue(`event: plan\ndata: ${JSON.stringify(event)}\n\n`);
      };
      bus.on("plan", onPlan);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("plan", onPlan);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
