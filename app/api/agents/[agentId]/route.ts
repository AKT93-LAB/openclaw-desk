import {
  buildAgentPatchRaw,
  listAgentWorkspaceFiles,
  parseConfigSnapshot,
} from "@/lib/openclaw-config";
import { getOpenClawBridge } from "@/lib/openclaw-client";
import type { AgentEditorState } from "@/lib/mission-types";

export const runtime = "nodejs";

function notFound(agentId: string) {
  return Response.json({ error: `Agent "${agentId}" was not found in the live config.` }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    const bridge = getOpenClawBridge();
    const configPayload = await bridge.request("config.get", {});
    const configSnapshot = parseConfigSnapshot(configPayload);
    const agent = configSnapshot.agentList.find((entry) => entry.id === agentId);
    if (!agent) {
      return notFound(agentId);
    }

    const files = await listAgentWorkspaceFiles(agent.workspacePath);
    const payload: AgentEditorState = {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      workspacePath: agent.workspacePath,
      agentDir: agent.agentDir,
      heartbeatEvery: agent.heartbeatEvery,
      sandboxMode: agent.sandboxMode,
      identityName: agent.identityName,
      identityTheme: agent.identityTheme,
      identityEmoji: agent.identityEmoji,
      files,
    };

    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load agent details." },
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
      model?: string;
      workspacePath?: string;
      agentDir?: string;
      heartbeatEvery?: string;
      sandboxMode?: string;
      identityName?: string;
      identityTheme?: string;
      identityEmoji?: string;
    };

    const bridge = getOpenClawBridge();
    const configPayload = await bridge.request("config.get", {});
    const configSnapshot = parseConfigSnapshot(configPayload);
    const agent = configSnapshot.agentList.find((entry) => entry.id === agentId);
    if (!agent) {
      return notFound(agentId);
    }
    if (!configSnapshot.hash) {
      throw new Error("OpenClaw did not return a config hash. Refusing to patch without concurrency protection.");
    }

    const raw = buildAgentPatchRaw(configSnapshot, agentId, {
      name: body.name ?? agent.name,
      model: body.model ?? agent.model,
      workspacePath: body.workspacePath ?? agent.workspacePath,
      agentDir: body.agentDir ?? agent.agentDir,
      heartbeatEvery: body.heartbeatEvery ?? agent.heartbeatEvery,
      sandboxMode: body.sandboxMode ?? agent.sandboxMode,
      identityName: body.identityName ?? agent.identityName,
      identityTheme: body.identityTheme ?? agent.identityTheme,
      identityEmoji: body.identityEmoji ?? agent.identityEmoji,
    });

    const response = await bridge.request("config.patch", {
      baseHash: configSnapshot.hash,
      raw,
      note: `Mission Control updated agent ${agentId}`,
    });

    return Response.json({ ok: true, response });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update agent config." },
      { status: 500 },
    );
  }
}
