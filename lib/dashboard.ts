import JSON5 from "json5";
import { parseConfigSnapshot } from "@/lib/openclaw-config";
import { getOpenClawBridge } from "@/lib/openclaw-client";
import type {
  ChatTranscriptItem,
  ChatTranscriptRole,
  DashboardAgent,
  DashboardAutomation,
  DashboardChannel,
  DashboardSession,
  MissionSnapshot,
  SettingsSummaryItem,
} from "@/lib/mission-types";

function compactText(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function inferAgentId(sessionKey?: string) {
  if (!sessionKey) {
    return undefined;
  }
  const match = /^agent:([^:]+):/.exec(sessionKey.trim());
  return match?.[1];
}

function extractTextFromContent(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const item = entry as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeTranscriptRole(role: unknown): ChatTranscriptRole {
  return role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "tool"
    ? role
    : "other";
}

function toChatTranscript(payload: unknown): ChatTranscriptItem[] {
  const record = payload as { messages?: unknown[] } | unknown[];
  const messages = Array.isArray(record) ? record : Array.isArray(record?.messages) ? record.messages : [];
  return messages
    .map((message, index) => {
      const entry = message as {
        id?: string;
        role?: string;
        content?: unknown;
        text?: string;
        timestamp?: number;
        runId?: string;
      };
      return {
        id: entry.id ?? `history_${index}`,
        role: normalizeTranscriptRole(entry.role),
        text: compactText(entry.text ?? extractTextFromContent(entry.content), ""),
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
        runId: entry.runId,
      };
    })
    .filter((message) => Boolean(message.text));
}

function buildSessions(payload: unknown): DashboardSession[] {
  const snapshot = (payload ?? {}) as { sessions?: unknown[] };
  const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  return sessions.slice(0, 48).map((session, index) => {
    const entry = session as {
      key?: string;
      derivedTitle?: string;
      displayName?: string;
      lastMessagePreview?: string;
      updatedAt?: number | null;
      state?: string;
      runState?: string;
      status?: string;
    };
    const key = entry.key ?? `session_${index}`;
    return {
      id: key,
      key,
      title: compactText(entry.derivedTitle ?? entry.displayName ?? entry.key, "OpenClaw session"),
      summary: compactText(entry.lastMessagePreview, "No recent preview returned by OpenClaw."),
      agentId: inferAgentId(key),
      stateLabel: compactText(entry.state ?? entry.runState ?? entry.status, "Session"),
      lastActiveAtMs: typeof entry.updatedAt === "number" ? entry.updatedAt : undefined,
    };
  });
}

function buildSettingsSummary(
  configSnapshot: ReturnType<typeof parseConfigSnapshot>,
  channelCount: number,
): SettingsSummaryItem[] {
  const config = configSnapshot.config;
  const tools = (config.tools ?? {}) as {
    profile?: string;
    sessions?: { visibility?: string };
    agentToAgent?: { enabled?: boolean };
  };
  const agentCount = configSnapshot.agentList.length;

  return [
    {
      id: "config-valid",
      label: "Config health",
      current: configSnapshot.valid ? "Valid" : "Needs attention",
      recommendation: "Edits in this dashboard write back through OpenClaw config.patch.",
    },
    {
      id: "agent-count",
      label: "Configured agents",
      current: `${agentCount} found`,
      recommendation: "This count comes from the live OpenClaw config.",
    },
    {
      id: "tool-profile",
      label: "Tool profile",
      current: tools.profile ? tools.profile : "Custom or unset",
    },
    {
      id: "session-visibility",
      label: "Session visibility",
      current: tools.sessions?.visibility ?? "tree",
    },
    {
      id: "agent-to-agent",
      label: "Cross-agent comms",
      current: tools.agentToAgent?.enabled ? "Enabled" : "Disabled",
    },
    {
      id: "channels",
      label: "Connected channels",
      current: `${channelCount}`,
    },
  ];
}

function buildChannels(payload: unknown): DashboardChannel[] {
  const snapshot = (payload ?? {}) as {
    channelOrder?: string[];
    channelLabels?: Record<string, string>;
    channelAccounts?: Record<string, unknown[]>;
  };
  const ids = snapshot.channelOrder ?? Object.keys(snapshot.channelAccounts ?? {});
  return ids.map((id) => {
    const accounts = Array.isArray(snapshot.channelAccounts?.[id]) ? snapshot.channelAccounts[id] : [];
    const connected = accounts.some((account) => {
      const row = account as { connected?: boolean; running?: boolean };
      return Boolean(row.connected || row.running);
    });
    const configured = accounts.length > 0;
    return {
      id,
      label: snapshot.channelLabels?.[id] ?? id,
      configured,
      connected,
      status: connected ? "ready" : configured ? "attention" : "offline",
      detail: connected
        ? "Channel is reachable."
        : configured
          ? "Configured but not connected."
          : "Not configured in the live snapshot.",
    };
  });
}

function buildAutomations(payload: unknown): DashboardAutomation[] {
  const snapshot = (payload ?? {}) as { jobs?: unknown[] };
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  return jobs.slice(0, 24).map((job, index) => {
    const entry = job as {
      id?: string;
      name?: string;
      enabled?: boolean;
      agentId?: string;
      schedule?: { kind?: string; at?: string; expr?: string; everyMs?: number };
      state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string };
    };
    const schedule =
      entry.schedule?.kind === "cron"
        ? entry.schedule.expr ?? "cron"
        : entry.schedule?.kind === "at"
          ? entry.schedule.at ?? "one-shot"
          : entry.schedule?.kind === "every"
            ? `Every ${Math.max(1, Math.round((entry.schedule.everyMs ?? 0) / 60000))} min`
            : "Scheduled";
    const status =
      entry.enabled === false
        ? "idle"
        : entry.state?.lastStatus === "error"
          ? "warning"
          : "healthy";
    return {
      id: entry.id ?? `job_${index}`,
      name: entry.name ?? "Automation",
      summary: status === "warning" ? "Recent run needs review." : "Automation is ready.",
      enabled: entry.enabled !== false,
      status,
      schedule,
      nextRunAtMs: entry.state?.nextRunAtMs,
      lastRunAtMs: entry.state?.lastRunAtMs,
      agentId: entry.agentId ?? undefined,
    };
  });
}

function buildAgents(
  liveAgentsPayload: unknown,
  configSnapshot: ReturnType<typeof parseConfigSnapshot>,
  sessions: DashboardSession[],
): DashboardAgent[] {
  const payload = (liveAgentsPayload ?? {}) as { agents?: unknown[] };
  const liveAgents = Array.isArray(payload.agents) ? payload.agents : [];
  const liveMap = new Map(
    liveAgents
      .map((entry) => {
        const agent = entry as { id?: string; name?: string };
        return agent.id ? [agent.id, agent] : null;
      })
      .filter(Boolean) as Array<[string, { id?: string; name?: string }]>,
  );
  const configMap = new Map(configSnapshot.agentList.map((agent) => [agent.id, agent]));
  const ids = Array.from(new Set([...liveMap.keys(), ...configMap.keys()])).sort();

  return ids.map((id) => {
    const live = liveMap.get(id);
    const config = configMap.get(id);
    const agentSessions = sessions.filter((session) => session.agentId === id);
    return {
      id,
      name: live?.name ?? config?.name ?? id,
      status: live ? "live" : "configured",
      model: config?.model || "Inherited / unset",
      workspacePath: config?.workspacePath ?? "",
      agentDir: config?.agentDir ?? "",
      heartbeatEvery: config?.heartbeatEvery || undefined,
      sandboxMode: config?.sandboxMode || undefined,
      identityName: config?.identityName || undefined,
      identityTheme: config?.identityTheme || undefined,
      identityEmoji: config?.identityEmoji || undefined,
      sessionCount: agentSessions.length,
      lastSessionTitle: agentSessions[0]?.title,
    };
  });
}

function pickNovaSessionKey(
  bridge: ReturnType<typeof getOpenClawBridge>,
  liveAgentsPayload: unknown,
  configSnapshot: ReturnType<typeof parseConfigSnapshot>,
) {
  const payload = (liveAgentsPayload ?? {}) as { agents?: unknown[] };
  const liveAgents = Array.isArray(payload.agents) ? payload.agents : [];
  const hasNova =
    liveAgents.some((entry) => (entry as { id?: string }).id === "nova") ||
    configSnapshot.agentList.some((agent) => agent.id === "nova");

  return {
    available: hasNova,
    sessionKey: hasNova ? `agent:nova:${bridge.mainKey}` : bridge.mainSessionKey,
  };
}

function buildOfflineSnapshot(errorMessage: string): MissionSnapshot {
  return {
    mode: "offline",
    generatedAtMs: Date.now(),
    connection: {
      mode: "offline",
      connected: false,
      gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? "unset",
      lastError: errorMessage,
    },
    nova: {
      available: false,
      sessionKey: "unavailable",
      chatPlaceholder: "Connect Mission Control to the OpenClaw gateway first.",
    },
    overview: {
      openSessions: 0,
      waitingForYou: 0,
      recentErrors: 0,
      liveAgents: 0,
      readyAutomations: 0,
      connectedChannels: 0,
    },
    sessions: [],
    approvals: [],
    automations: [],
    channels: [],
    agents: [],
    settings: [
      {
        id: "gateway",
        label: "Gateway connection",
        current: "Offline",
        recommendation:
          "Set OPENCLAW_GATEWAY_URL and gateway credentials. The dashboard will stay empty until it can read live OpenClaw state.",
      },
    ],
    officeFeed: [],
    chat: [],
  };
}

export async function getMissionControlSnapshot(): Promise<MissionSnapshot> {
  try {
    const bridge = getOpenClawBridge();
    await bridge.ensureConnected();

    const [agents, sessionsPayload, cron, channels, config] = await Promise.all([
      bridge.request("agents.list", {}),
      bridge.request("sessions.list", {
        limit: 100,
        includeDerivedTitles: true,
        includeLastMessage: true,
      }),
      bridge.request("cron.list", {
        limit: 50,
        enabled: "all",
        sortBy: "nextRunAtMs",
        sortDir: "asc",
      }),
      bridge.request("channels.status", {}),
      bridge.request("config.get", {}),
    ]);

    const configSnapshot = parseConfigSnapshot(config);
    const nova = pickNovaSessionKey(bridge, agents, configSnapshot);

    let chat: unknown;
    try {
      chat = await bridge.request("chat.history", {
        sessionKey: nova.sessionKey,
        limit: 30,
      });
    } catch {
      chat = { messages: [] };
    }

    const builtSessions = buildSessions(sessionsPayload);
    const builtChannels = buildChannels(channels);
    const builtAutomations = buildAutomations(cron);
    const builtAgents = buildAgents(agents, configSnapshot, builtSessions);
    const officeFeed = bridge.getRecentEvents(40);
    const approvals = bridge.getPendingApprovals();
    const recentErrors = new Set(
      officeFeed
        .filter((event) => event.severity === "error")
        .map((event) => event.runId ?? event.id),
    ).size;

    return {
      mode: "live",
      generatedAtMs: Date.now(),
      connection: {
        mode: "live",
        connected: bridge.connectionState.connected,
        gatewayUrl: bridge.connectionState.gatewayUrl,
        serverVersion: bridge.connectionState.serverVersion,
        lastError: bridge.connectionState.lastError,
      },
      nova: {
        available: nova.available,
        sessionKey: nova.sessionKey,
        chatPlaceholder: nova.available
          ? "Ask Nova anything. Mission Control will show the real work as OpenClaw performs it."
          : "No live Nova agent is configured in OpenClaw.",
      },
      overview: {
        openSessions: builtSessions.length,
        waitingForYou: approvals.length,
        recentErrors,
        liveAgents: builtAgents.filter((agent) => agent.status === "live").length,
        readyAutomations: builtAutomations.filter((job) => job.enabled).length,
        connectedChannels: builtChannels.filter((channel) => channel.connected).length,
      },
      sessions: builtSessions,
      approvals,
      automations: builtAutomations,
      channels: builtChannels,
      agents: builtAgents,
      settings: buildSettingsSummary(configSnapshot, builtChannels.length),
      officeFeed,
      chat: toChatTranscript(chat),
    };
  } catch (error) {
    return buildOfflineSnapshot(
      error instanceof Error ? error.message : "Mission Control could not reach OpenClaw.",
    );
  }
}
