import { getOpenClawBridge } from "@/lib/openclaw-client";

export const runtime = "nodejs";

type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      decision?: ApprovalDecision;
    };
    if (!body.id || !body.decision) {
      return Response.json({ error: "Missing approval id or decision." }, { status: 400 });
    }
    const bridge = getOpenClawBridge();
    await bridge.request("exec.approval.resolve", {
      id: body.id,
      decision: body.decision,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Approval resolution failed." },
      { status: 500 },
    );
  }
}

