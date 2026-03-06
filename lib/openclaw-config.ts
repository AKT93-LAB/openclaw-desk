import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";

const editableAgentFiles = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "HEARTBEAT.md",
  "USER.md",
  "MEMORY.md",
] as const;

export type EditableAgentFileName = (typeof editableAgentFiles)[number];

type JsonRecord = Record<string, unknown>;

export type ParsedConfigSnapshot = {
  hash?: string;
  valid: boolean;
  config: JsonRecord;
  agentsDefaults: JsonRecord;
  agentList: AgentConfigRecord[];
};

export type AgentConfigRecord = {
  id: string;
  source: "list" | "defaults";
  raw: JsonRecord;
  name: string;
  model: string;
  workspacePath: string;
  agentDir: string;
  heartbeatEvery: string;
  sandboxMode: string;
  identityName: string;
  identityTheme: string;
  identityEmoji: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeModel(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && typeof value.primary === "string") {
    return value.primary;
  }
  return "";
}

function expandHome(value: string) {
  if (!value.startsWith("~")) {
    return value;
  }
  return path.join(os.homedir(), value.slice(1).replace(/^[/\\]+/, ""));
}

function defaultWorkspacePath(agentId: string) {
  return agentId === "main"
    ? "~/.openclaw/workspace"
    : `~/.openclaw/agents/${agentId}/workspace`;
}

function defaultAgentDir(agentId: string) {
  return `~/.openclaw/agents/${agentId}`;
}

function normalizeAgentRecord(rawAgent: JsonRecord, defaults: JsonRecord, source: "list" | "defaults") {
  const id = compactText(typeof rawAgent.id === "string" ? rawAgent.id : "main") || "main";
  const identity = isRecord(rawAgent.identity) ? rawAgent.identity : {};
  const defaultIdentity = isRecord(defaults.identity) ? defaults.identity : {};
  const heartbeat = isRecord(rawAgent.heartbeat) ? rawAgent.heartbeat : {};
  const defaultHeartbeat = isRecord(defaults.heartbeat) ? defaults.heartbeat : {};
  const sandbox = isRecord(rawAgent.sandbox) ? rawAgent.sandbox : {};
  const defaultSandbox = isRecord(defaults.sandbox) ? defaults.sandbox : {};

  return {
    id,
    source,
    raw: rawAgent,
    name:
      compactText(typeof rawAgent.name === "string" ? rawAgent.name : undefined) ||
      compactText(typeof identity.name === "string" ? identity.name : undefined) ||
      compactText(typeof defaultIdentity.name === "string" ? defaultIdentity.name : undefined) ||
      id,
    model: normalizeModel(rawAgent.model ?? defaults.model),
    workspacePath:
      compactText(typeof rawAgent.workspace === "string" ? rawAgent.workspace : undefined) ||
      compactText(typeof defaults.workspace === "string" ? defaults.workspace : undefined) ||
      defaultWorkspacePath(id),
    agentDir:
      compactText(typeof rawAgent.agentDir === "string" ? rawAgent.agentDir : undefined) ||
      compactText(typeof defaults.agentDir === "string" ? defaults.agentDir : undefined) ||
      defaultAgentDir(id),
    heartbeatEvery:
      compactText(typeof heartbeat.every === "string" ? heartbeat.every : undefined) ||
      compactText(typeof defaultHeartbeat.every === "string" ? defaultHeartbeat.every : undefined),
    sandboxMode:
      compactText(typeof sandbox.mode === "string" ? sandbox.mode : undefined) ||
      compactText(typeof defaultSandbox.mode === "string" ? defaultSandbox.mode : undefined),
    identityName:
      compactText(typeof identity.name === "string" ? identity.name : undefined) ||
      compactText(typeof defaultIdentity.name === "string" ? defaultIdentity.name : undefined),
    identityTheme:
      compactText(typeof identity.theme === "string" ? identity.theme : undefined) ||
      compactText(typeof defaultIdentity.theme === "string" ? defaultIdentity.theme : undefined),
    identityEmoji:
      compactText(typeof identity.emoji === "string" ? identity.emoji : undefined) ||
      compactText(typeof defaultIdentity.emoji === "string" ? defaultIdentity.emoji : undefined),
  };
}

export function parseConfigSnapshot(payload: unknown) {
  const snapshot = (payload ?? {}) as {
    raw?: string | null;
    config?: JsonRecord | null;
    valid?: boolean | null;
    hash?: string | null;
  };
  const config =
    snapshot.config ??
    (() => {
      if (!snapshot.raw) {
        return {};
      }
      try {
        return JSON5.parse(snapshot.raw) as JsonRecord;
      } catch {
        return {};
      }
    })();

  const agents = isRecord(config.agents) ? config.agents : {};
  const defaults = isRecord(agents.defaults) ? agents.defaults : {};
  const list = Array.isArray(agents.list) ? agents.list.filter(isRecord) : [];
  const records = list.length
    ? list.map((agent) => normalizeAgentRecord(agent, defaults, "list"))
    : [normalizeAgentRecord({ id: "main" }, defaults, "defaults")];

  return {
    hash: typeof snapshot.hash === "string" ? snapshot.hash : undefined,
    valid: snapshot.valid !== false,
    config,
    agentsDefaults: defaults,
    agentList: records,
  } satisfies ParsedConfigSnapshot;
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setStringField(target: JsonRecord, key: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    delete target[key];
    return;
  }
  target[key] = trimmed;
}

function setNestedStringField(target: JsonRecord, key: string, nestedKey: string, value: string) {
  const trimmed = value.trim();
  const nested = isRecord(target[key]) ? { ...target[key] } : {};
  if (!trimmed) {
    delete nested[nestedKey];
  } else {
    nested[nestedKey] = trimmed;
  }
  if (Object.keys(nested).length) {
    target[key] = nested;
  } else {
    delete target[key];
  }
}

export function buildAgentPatchRaw(
  snapshot: ParsedConfigSnapshot,
  agentId: string,
  update: {
    name: string;
    model: string;
    workspacePath: string;
    agentDir: string;
    heartbeatEvery: string;
    sandboxMode: string;
    identityName: string;
    identityTheme: string;
    identityEmoji: string;
  },
) {
  const agents = isRecord(snapshot.config.agents) ? cloneRecord(snapshot.config.agents) : {};
  const list = Array.isArray(agents.list) ? cloneRecord(agents.list) : [];
  const listIndex = list.findIndex((entry) => isRecord(entry) && entry.id === agentId);

  if (listIndex >= 0) {
    const target = isRecord(list[listIndex]) ? cloneRecord(list[listIndex]) : { id: agentId };
    setStringField(target, "name", update.name);
    setStringField(target, "workspace", update.workspacePath);
    setStringField(target, "agentDir", update.agentDir);
    setStringField(target, "model", update.model);
    setNestedStringField(target, "heartbeat", "every", update.heartbeatEvery);
    setNestedStringField(target, "sandbox", "mode", update.sandboxMode);
    setNestedStringField(target, "identity", "name", update.identityName);
    setNestedStringField(target, "identity", "theme", update.identityTheme);
    setNestedStringField(target, "identity", "emoji", update.identityEmoji);
    list[listIndex] = target;
    return JSON.stringify({ agents: { list } }, null, 2);
  }

  if (agentId === "main") {
    const defaults = isRecord(agents.defaults) ? cloneRecord(agents.defaults) : {};
    setStringField(defaults, "workspace", update.workspacePath);
    setStringField(defaults, "agentDir", update.agentDir);
    setStringField(defaults, "model", update.model);
    setNestedStringField(defaults, "heartbeat", "every", update.heartbeatEvery);
    setNestedStringField(defaults, "sandbox", "mode", update.sandboxMode);
    setNestedStringField(defaults, "identity", "name", update.identityName || update.name);
    setNestedStringField(defaults, "identity", "theme", update.identityTheme);
    setNestedStringField(defaults, "identity", "emoji", update.identityEmoji);
    return JSON.stringify({ agents: { defaults } }, null, 2);
  }

  throw new Error(`Agent "${agentId}" is not present in config.agents.list.`);
}

function resolveWorkspaceRoot(workspacePath: string) {
  return path.resolve(expandHome(workspacePath));
}

function resolveEditableFilePath(workspacePath: string, name: EditableAgentFileName) {
  const root = resolveWorkspaceRoot(workspacePath);
  const filePath = path.resolve(root, name);
  if (!filePath.startsWith(root)) {
    throw new Error("Resolved workspace path is invalid.");
  }
  return { root, filePath };
}

export async function listAgentWorkspaceFiles(workspacePath: string) {
  const statuses = await Promise.all(
    editableAgentFiles.map(async (name) => {
      const { filePath } = resolveEditableFilePath(workspacePath, name);
      try {
        await fs.access(filePath);
        return { name, exists: true };
      } catch {
        return { name, exists: false };
      }
    }),
  );
  return statuses;
}

export async function readAgentWorkspaceFile(workspacePath: string, name: EditableAgentFileName) {
  const { filePath } = resolveEditableFilePath(workspacePath, name);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function writeAgentWorkspaceFile(
  workspacePath: string,
  name: EditableAgentFileName,
  content: string,
) {
  const { root, filePath } = resolveEditableFilePath(workspacePath, name);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export function isEditableAgentFileName(value: string): value is EditableAgentFileName {
  return editableAgentFiles.includes(value as EditableAgentFileName);
}
