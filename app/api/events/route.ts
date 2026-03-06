import { getOpenClawBridge } from "@/lib/openclaw-client";
import type { MissionEvent } from "@/lib/mission-types";

export const runtime = "nodejs";

function encodeEvent(event: MissionEvent) {
  return `event: mission\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let bridge: ReturnType<typeof getOpenClawBridge>;
  try {
    bridge = getOpenClawBridge();
  } catch (error) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 5000\n\n"));
        const event: MissionEvent = {
          id: `gateway.unconfigured:${Date.now()}`,
          kind: "system.notice",
          ts: Date.now(),
          title: "Gateway not configured",
          message: error instanceof Error ? error.message : "Mission Control is waiting for OpenClaw gateway settings.",
          severity: "warn",
        };
        controller.enqueue(encoder.encode(encodeEvent(event)));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  }

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      void bridge.ensureConnected().catch((error) => {
        const event: MissionEvent = {
          id: `gateway.connect-error:${Date.now()}`,
          kind: "system.notice",
          ts: Date.now(),
          title: "Gateway connection issue",
          message: error instanceof Error ? error.message : "Mission Control could not reach OpenClaw.",
          severity: "warn",
        };
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });
      unsubscribe = bridge.subscribe((event) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        unsubscribe = null;
        controller.close();
      });
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
