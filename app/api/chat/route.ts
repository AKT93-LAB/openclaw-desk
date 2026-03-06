import { getOpenClawBridge } from "@/lib/openclaw-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const bridge = getOpenClawBridge();
    await bridge.ensureConnected();
    const agents = (await bridge.request("agents.list", {})) as { agents?: Array<{ id?: string }> };
    const hasNova = Array.isArray(agents.agents) && agents.agents.some((agent) => agent.id === "nova");
    if (!hasNova) {
      return Response.json(
        { error: "Nova is not configured as a live OpenClaw agent." },
        { status: 409 },
      );
    }
    const sessionKey = `agent:nova:${bridge.mainKey}`;

    const response = (await bridge.request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: `nova_${Date.now().toString(36)}`,
    })) as { runId?: string; status?: string };

    return Response.json({
      ok: true,
      runId: response.runId,
      status: response.status ?? "started",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Chat request failed." },
      { status: 500 },
    );
  }
}
