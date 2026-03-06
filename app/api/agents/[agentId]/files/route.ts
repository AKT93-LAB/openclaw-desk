import {
  isEditableAgentFileName,
  listAgentWorkspaceFiles,
  parseConfigSnapshot,
  readAgentWorkspaceFile,
  writeAgentWorkspaceFile,
} from "@/lib/openclaw-config";
import { getOpenClawBridge } from "@/lib/openclaw-client";

export const runtime = "nodejs";

async function resolveAgentWorkspace(agentId: string) {
  const bridge = getOpenClawBridge();
  const configPayload = await bridge.request("config.get", {});
  const configSnapshot = parseConfigSnapshot(configPayload);
  const agent = configSnapshot.agentList.find((entry) => entry.id === agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" was not found in the live config.`);
  }
  return {
    workspacePath: agent.workspacePath,
    files: await listAgentWorkspaceFiles(agent.workspacePath),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.trim() ?? "";
    if (!isEditableAgentFileName(name)) {
      return Response.json({ error: "Unsupported agent file." }, { status: 400 });
    }

    const { workspacePath, files } = await resolveAgentWorkspace(agentId);
    const content = await readAgentWorkspaceFile(workspacePath, name);
    const file = files.find((entry) => entry.name === name);

    return Response.json({
      name,
      exists: file?.exists ?? false,
      content,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load agent file." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      content?: string;
    };
    const name = body.name?.trim() ?? "";
    if (!isEditableAgentFileName(name)) {
      return Response.json({ error: "Unsupported agent file." }, { status: 400 });
    }

    const { workspacePath } = await resolveAgentWorkspace(agentId);
    await writeAgentWorkspaceFile(workspacePath, name, body.content ?? "");

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to write agent file." },
      { status: 500 },
    );
  }
}
