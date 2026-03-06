import { getOpenClawBridge } from "@/lib/openclaw-client";
import { createTaskFromChat, linkTaskToRun } from "@/lib/task-store";

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
    const sessionKey = hasNova ? `agent:nova:${bridge.mainKey}` : bridge.mainSessionKey;
    const task = await createTaskFromChat({
      sessionKey,
      message,
      ownerAgentId: "nova",
    });

    const response = (await bridge.request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: `nova_${Date.now().toString(36)}`,
    })) as { runId?: string; status?: string };

    if (response.runId) {
      await linkTaskToRun(task.id, response.runId);
    }

    return Response.json({
      ok: true,
      taskId: task.id,
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
