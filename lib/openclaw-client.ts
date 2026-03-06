import JSON5 from "json5";
import WebSocket from "ws";
import { agentBlueprints } from "@/lib/agent-pack";
import type { MissionEvent, MissionEventKind } from "@/lib/mission-types";
import { recordMissionEvent } from "@/lib/task-store";

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: {
    version?: string;
  };
  snapshot?: {
    sessionDefaults?: {
      defaultAgentId?: string;
      mainKey?: string;
      mainSessionKey?: string;
      scope?: string;
    };
  };
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

function createRequestId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function compactText(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function inferAgentId(sessionKey?: string) {
  if (!sessionKey) {
    return undefined;
  }
  const match = /^agent:([^:]+):/.exec(sessionKey.trim());
  return match?.[1];
}

function extractChatText(message: unknown) {
  if (!message || typeof message !== "object") {
    return "";
  }
  const record = message as { content?: unknown; text?: unknown };
  if (typeof record.text === "string") {
    return record.text;
  }
  if (!Array.isArray(record.content)) {
    return "";
  }
  return record.content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const entry = item as { type?: unknown; text?: unknown };
      return entry.type === "text" && typeof entry.text === "string" ? entry.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeGatewayEvent(frame: GatewayEventFrame): MissionEvent {
  const ts = Date.now();

  if (frame.event === "chat") {
    const payload = (frame.payload ?? {}) as {
      state?: string;
      runId?: string;
      sessionKey?: string;
      message?: unknown;
      errorMessage?: string;
    };
    const kind =
      payload.state === "final"
        ? "chat.final"
        : payload.state === "error"
          ? "chat.error"
          : payload.state === "aborted"
            ? "chat.aborted"
            : "chat.delta";
    const text =
      kind === "chat.error"
        ? compactText(payload.errorMessage, "The run failed.")
        : compactText(extractChatText(payload.message), "Nova is still working.");
    return {
      id: payload.runId ? `${payload.runId}:${kind}:${frame.seq ?? ts}` : `chat:${frame.seq ?? ts}`,
      kind,
      ts,
      title:
        kind === "chat.final"
          ? "Reply completed"
          : kind === "chat.error"
            ? "Run failed"
            : kind === "chat.aborted"
              ? "Run stopped"
              : "Reply streaming",
      message: text,
      severity: kind === "chat.error" ? "error" : kind === "chat.aborted" ? "warn" : "info",
      runId: payload.runId,
      sessionKey: payload.sessionKey,
      agentId: inferAgentId(payload.sessionKey),
      raw: frame.payload,
    };
  }

  if (frame.event === "agent") {
    const payload = (frame.payload ?? {}) as {
      runId?: string;
      stream?: string;
      sessionKey?: string;
      data?: Record<string, unknown>;
    };
    const stream = payload.stream ?? "assistant";
    const data = payload.data ?? {};

    if (stream === "tool") {
      const toolName =
        typeof data.name === "string"
          ? data.name
          : typeof data.tool === "string"
            ? data.tool
            : "tool";
      const rawDetail =
        typeof data.result === "string"
          ? data.result
          : typeof data.partialResult === "string"
            ? data.partialResult
            : typeof data.text === "string"
              ? data.text
              : `Used ${toolName}.`;
      return {
        id: payload.runId ? `${payload.runId}:tool:${frame.seq ?? ts}` : `tool:${frame.seq ?? ts}`,
        kind: "agent.tool",
        ts,
        title: `Tool activity: ${toolName}`,
        message: compactText(rawDetail, `Used ${toolName}.`),
        severity: "info",
        runId: payload.runId,
        sessionKey: payload.sessionKey,
        agentId: inferAgentId(payload.sessionKey),
        raw: frame.payload,
      };
    }

    if (stream === "lifecycle") {
      const phase = typeof data.phase === "string" ? data.phase : "update";
      const message =
        typeof data.note === "string"
          ? data.note
          : typeof data.reason === "string"
            ? data.reason
            : typeof data.label === "string"
              ? data.label
              : `Lifecycle phase: ${phase}`;
      return {
        id: payload.runId ? `${payload.runId}:lifecycle:${frame.seq ?? ts}` : `lifecycle:${frame.seq ?? ts}`,
        kind: "agent.lifecycle",
        ts,
        title: `Lifecycle: ${phase}`,
        message: compactText(message, `Lifecycle phase: ${phase}`),
        severity: phase === "error" ? "error" : "info",
        runId: payload.runId,
        sessionKey: payload.sessionKey,
        agentId: inferAgentId(payload.sessionKey),
        raw: frame.payload,
      };
    }

    const assistantNote = compactText(
      typeof data.text === "string" ? data.text : "",
      "Agent office activity updated.",
    );
    return {
      id: payload.runId ? `${payload.runId}:note:${frame.seq ?? ts}` : `note:${frame.seq ?? ts}`,
      kind: "agent.note",
      ts,
      title: "Agent note",
      message: assistantNote,
      severity: "info",
      runId: payload.runId,
      sessionKey: payload.sessionKey,
      agentId: inferAgentId(payload.sessionKey),
      raw: frame.payload,
    };
  }

  if (frame.event === "exec.approval.requested") {
    const payload = (frame.payload ?? {}) as {
      id?: string;
      request?: {
        command?: string;
        sessionKey?: string | null;
        agentId?: string | null;
      };
    };
    return {
      id: payload.id ?? `approval:${ts}`,
      kind: "approval.requested",
      ts,
      title: "Approval needed",
      message: compactText(payload.request?.command, "An approval request is waiting."),
      severity: "warn",
      sessionKey: payload.request?.sessionKey ?? undefined,
      agentId: payload.request?.agentId ?? inferAgentId(payload.request?.sessionKey ?? undefined),
      raw: frame.payload,
    };
  }

  if (frame.event === "exec.approval.resolved") {
    const payload = (frame.payload ?? {}) as {
      id?: string;
      decision?: string;
      request?: {
        sessionKey?: string | null;
        agentId?: string | null;
      };
    };
    return {
      id: payload.id ?? `approval:${ts}`,
      kind: "approval.resolved",
      ts,
      title: "Approval resolved",
      message: compactText(payload.decision, "Approval decision recorded."),
      severity: "info",
      sessionKey: payload.request?.sessionKey ?? undefined,
      agentId: payload.request?.agentId ?? inferAgentId(payload.request?.sessionKey ?? undefined),
      raw: frame.payload,
    };
  }

  const genericKindMap: Record<string, MissionEventKind> = {
    cron: "cron.update",
    presence: "presence.update",
    health: "health.update",
  };

  return {
    id: `${frame.event}:${frame.seq ?? ts}`,
    kind: genericKindMap[frame.event] ?? "system.notice",
    ts,
    title: frame.event,
    message: compactText(JSON5.stringify(frame.payload ?? {}), `${frame.event} updated.`),
    severity: "info",
    raw: frame.payload,
  };
}

class OpenClawBridge {
  private ws: WebSocket | null = null;
  private connected = false;
  private hello: GatewayHelloOk | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<(event: MissionEvent) => void>();
  private backoffMs = 1_000;
  private connectSent = false;
  private connectNonce: string | null = null;
  private lastError: string | undefined;

  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly password?: string,
  ) {}

  get snapshot() {
    return this.hello;
  }

  get serverVersion() {
    return this.hello?.server?.version;
  }

  get connectionState() {
    return {
      connected: this.connected,
      gatewayUrl: this.url,
      serverVersion: this.serverVersion,
      lastError: this.lastError,
    };
  }

  get mainSessionKey() {
    return this.hello?.snapshot?.sessionDefaults?.mainSessionKey ?? "agent:main:main";
  }

  get mainKey() {
    return this.hello?.snapshot?.sessionDefaults?.mainKey ?? "main";
  }

  subscribe(listener: (event: MissionEvent) => void) {
    this.listeners.add(listener);
    void this.ensureConnected().catch(() => {
      // Subscribers can still receive a later reconnect once configuration is fixed.
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  async ensureConnected() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }
    await this.connectPromise;
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    await this.ensureConnected();
    return await this.sendRequest<T>(method, params);
  }

  private async connect() {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.ws = socket;
      this.connectSent = false;
      this.connectNonce = null;

      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      socket.on("open", () => {
        setTimeout(() => {
          void this.sendConnect().catch((error) => {
            settle(() => reject(error));
          });
        }, 150);
      });

      socket.on("message", (buffer) => {
        const raw = String(buffer);
        this.handleMessage(raw, {
          onHello: () => {
            settle(() => resolve());
          },
        });
      });

      socket.on("close", (_code, reasonBuffer) => {
        const reason = String(reasonBuffer ?? "");
        this.connected = false;
        this.lastError = reason || "Gateway connection closed.";
        this.ws = null;
        this.flushPending(new Error(this.lastError));
        if (!settled) {
          settle(() => reject(new Error(this.lastError)));
        } else {
          void this.emitAndPersist({
            id: `gateway.disconnect:${Date.now()}`,
            kind: "gateway.disconnected",
            ts: Date.now(),
            title: "Gateway disconnected",
            message: this.lastError,
            severity: "warn",
          });
          this.scheduleReconnect();
          this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
        }
      });

      socket.on("error", (error) => {
        this.lastError = error.message;
      });
    }).finally(() => {
      this.connectPromise = null;
    });
  }

  private async sendConnect() {
    if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.connectSent = true;
    const auth =
      this.token?.trim()
        ? {
            token: this.token.trim(),
          }
        : this.password?.trim()
          ? {
              password: this.password.trim(),
            }
          : undefined;
    const hello = await this.sendRequest<GatewayHelloOk>("connect", {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "mission-control",
        version: "0.1.0",
        platform: "node",
        mode: "webchat",
        instanceId: "mission-control-server",
      },
      role: "operator",
      scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals"],
      caps: [],
      auth,
      locale: "en",
    });
    this.hello = hello;
    this.connected = true;
    this.lastError = undefined;
    this.backoffMs = 1_000;
    await this.emitAndPersist({
      id: `gateway.connected:${Date.now()}`,
      kind: "gateway.connected",
      ts: Date.now(),
      title: "Gateway connected",
      message: compactText(hello.server?.version, "Mission Control is linked to OpenClaw."),
      severity: "info",
    });
  }

  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not connected.");
    }
    const id = createRequestId();
    const frame = { type: "req", id, method, params };
    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
      });
      this.ws?.send(JSON.stringify(frame), (error) => {
        if (!error) {
          return;
        }
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private flushPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleMessage(raw: string, opts?: { onHello?: () => void }) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const typed = parsed as { type?: unknown };
    if (typed.type === "event") {
      const eventFrame = parsed as GatewayEventFrame;
      if (eventFrame.event === "connect.challenge") {
        const payload = eventFrame.payload as { nonce?: unknown } | undefined;
        this.connectNonce = typeof payload?.nonce === "string" ? payload.nonce : null;
        void this.sendConnect().catch(() => {
          // The close handler will carry the failure state.
        });
        return;
      }
      const event = normalizeGatewayEvent(eventFrame);
      void this.emitAndPersist(event);
      return;
    }

    if (typed.type === "res") {
      const response = parsed as GatewayResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.payload);
        const hello = response.payload as GatewayHelloOk | undefined;
        if (hello?.type === "hello-ok") {
          opts?.onHello?.();
        }
      } else {
        const message = response.error?.message ?? "Gateway request failed.";
        pending.reject(new Error(message));
      }
    }
  }

  private async emitAndPersist(event: MissionEvent) {
    await recordMissionEvent(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private scheduleReconnect() {
    if (!this.listeners.size) {
      return;
    }
    setTimeout(() => {
      if (this.connected || this.connectPromise) {
        return;
      }
      void this.ensureConnected().catch(() => {
        // The next close/error cycle will back off and retry again.
      });
    }, this.backoffMs);
  }
}

let singleton: OpenClawBridge | null = null;

export function getOpenClawBridge() {
  if (singleton) {
    return singleton;
  }
  const url = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (!url) {
    throw new Error("OPENCLAW_GATEWAY_URL is not configured.");
  }
  singleton = new OpenClawBridge(
    url,
    process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || undefined,
    process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() || undefined,
  );
  return singleton;
}

export function getKnownOfficeAgentIds() {
  return new Set(agentBlueprints.map((agent) => agent.id));
}
