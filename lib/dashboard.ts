import JSON5 from "json5";
import { getAgentPackManifest } from "@/lib/agent-pack";
import { getOpenClawBridge } from "@/lib/openclaw-client";
import type {
  ChatTranscriptItem,
  ChatTranscriptRole,
  DashboardAgent,
  DashboardAutomation,
  DashboardChannel,
  DashboardTask,
  MissionSnapshot,
  SettingsSummaryItem,
} from "@/lib/mission-types";
import { listRecentMissionEvents, listStoredApprovals, listStoredTasks } from "@/lib/task-store";

function compactText(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
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
  const transcript: ChatTranscriptItem[] = [];
  messages.forEach((message, index) => {
    const entry = message as {
      id?: string;
      role?: string;
      content?: unknown;
      text?: string;
      timestamp?: number;
      runId?: string;
    };
    transcript.push({
      id: entry.id ?? `history_${index}`,
      role: normalizeTranscriptRole(entry.role),
      text: compactText(entry.text ?? extractTextFromContent(entry.content), "No transcript text."),
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
      runId: entry.runId,
    });
  });
  return transcript.filter((message) => Boolean(message.text));
}

function deriveAmbientTasks(sessionsPayload: unknown): DashboardTask[] {
  const payload = sessionsPayload as { sessions?: unknown[] } | undefined;
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  return sessions.slice(0, 6).map((session, index) => {
    const entry = session as {
      key?: string;
      derivedTitle?: string;
      displayName?: string;
      lastMessagePreview?: string;
      updatedAt?: number | null;
    };
    const key = entry.key ?? `ambient_${index}`;
    return {
      id: `ambient_${key.replace(/[^a-z0-9:_-]+/gi, "_")}`,
      title: compactText(entry.derivedTitle ?? entry.displayName, "OpenClaw session"),
      summary: compactText(entry.lastMessagePreview, "Session activity observed from OpenClaw."),
      status: "doing",
      source: "ambient-session",
      sessionKey: entry.key,
      needsApproval: false,
      blockers: [],
      missing: [],
      completed: [],
      nextStep: "Open the session and inspect recent activity.",
      createdAtMs: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
      updatedAtMs: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
      lastEvent: "Imported from live sessions.",
    };
  });
}

function buildSettingsSummary(configPayload: unknown, channelCount: number): SettingsSummaryItem[] {
  const snapshot = (configPayload ?? {}) as {
    raw?: string | null;
    config?: Record<string, unknown> | null;
    valid?: boolean | null;
  };
  const config =
    snapshot.config ??
    (() => {
      if (!snapshot.raw) {
        return {};
      }
      try {
        return JSON5.parse(snapshot.raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

  const agentsConfig = (config.agents ?? {}) as {
    list?: unknown[];
    defaults?: {
      heartbeat?: { every?: string };
      sandbox?: { mode?: string };
    };
  };
  const tools = (config.tools ?? {}) as {
    profile?: string;
    sessions?: { visibility?: string };
    agentToAgent?: { enabled?: boolean };
  };
  const agentCount = Array.isArray(agentsConfig.list) ? agentsConfig.list.length : 0;

  return [
    {
      id: "config-valid",
      label: "Config health",
      current: snapshot.valid === false ? "Needs attention" : "Valid",
      recommendation: "Keep changes review-first and hash-guarded.",
    },
    {
      id: "agent-count",
      label: "Configured agents",
      current: agentCount ? `${agentCount} configured` : "Single-agent or unset",
      recommendation: "Adopt the office pack for clear ownership lanes.",
    },
    {
      id: "tool-profile",
      label: "Tool posture",
      current: tools.profile ? `Profile: ${tools.profile}` : "Custom or unrestricted",
      recommendation: "Use explicit per-agent guardrails for specialist lanes.",
    },
    {
      id: "session-visibility",
      label: "Session visibility",
      current: tools.sessions?.visibility ?? "tree",
      recommendation: "Use all only for controlled office routing.",
    },
    {
      id: "agent-to-agent",
      label: "Cross-agent comms",
      current: tools.agentToAgent?.enabled ? "Enabled" : "Disabled",
      recommendation: "Enable only for the office agents and document the protocol.",
    },
    {
      id: "heartbeat",
      label: "Heartbeat cadence",
      current: agentsConfig.defaults?.heartbeat?.every ?? "Not configured",
      recommendation: "Use heartbeat for office continuity and light checks.",
    },
    {
      id: "sandbox",
      label: "Sandbox mode",
      current: agentsConfig.defaults?.sandbox?.mode ?? "Not configured",
      recommendation: "Non-main sandboxing is the sane default for shared surfaces.",
    },
    {
      id: "channels",
      label: "Channel footprint",
      current: `${channelCount} surfaced`,
      recommendation: "Keep external delivery approval-gated.",
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
          : "Not configured in the surfaced snapshot.",
    };
  });
}

function buildAutomations(payload: unknown): DashboardAutomation[] {
  const snapshot = (payload ?? {}) as { jobs?: unknown[] };
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  return jobs.slice(0, 12).map((job, index) => {
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
      summary: status === "warning" ? "Recent run needs review." : "Automation is standing by.",
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
  tasks: DashboardTask[],
  pack: ReturnType<typeof getAgentPackManifest>,
): DashboardAgent[] {
  const payload = (liveAgentsPayload ?? {}) as { agents?: unknown[] };
  const liveAgents = Array.isArray(payload.agents) ? payload.agents : [];
  return pack.agents.map((agent) => {
    const live = liveAgents.find((entry) => {
      const item = entry as { id?: string };
      return item.id === agent.id;
    }) as { id?: string; name?: string } | undefined;
    const liveTaskCount = tasks.filter(
      (task) => task.ownerAgentId === agent.id || task.sessionKey?.startsWith(`agent:${agent.id}:`),
    ).length;
    return {
      id: agent.id,
      name: live?.name ?? agent.name,
      title: agent.title,
      soul: agent.soul,
      status: live ? "live" : "planned",
      modelStrategy: agent.modelStrategy,
      reasoningMode: agent.reasoningMode,
      qualityBar: agent.qualityBar,
      currentFocus:
        tasks.find((task) => task.ownerAgentId === agent.id)?.title ??
        (live ? "Live in the office." : "Awaiting configuration."),
      workload: liveTaskCount ? `${liveTaskCount} active items` : live ? "Standing by" : "Proposed only",
      liveTasks: liveTaskCount,
      outputHome: agent.outputHome,
      workspacePath: agent.workspacePath,
    };
  });
}

function pickNovaSessionKey(bridge: ReturnType<typeof getOpenClawBridge>, liveAgentsPayload: unknown) {
  const payload = (liveAgentsPayload ?? {}) as { agents?: unknown[] };
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  const hasNova = agents.some((agent) => {
    const entry = agent as { id?: string };
    return entry.id === "nova";
  });
  return hasNova ? `agent:nova:${bridge.mainKey}` : bridge.mainSessionKey;
}

function buildDemoSnapshot(errorMessage: string): MissionSnapshot {
  const pack = getAgentPackManifest();
  return {
    mode: "demo",
    generatedAtMs: Date.now(),
    connection: {
      mode: "demo",
      connected: false,
      gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? "unset",
      lastError: errorMessage,
    },
    nova: {
      sessionKey: "agent:nova:main",
      chatPlaceholder: "Connect Mission Control to OpenClaw to chat with Nova.",
    },
    overview: {
      activeTasks: 0,
      waitingForYou: 0,
      blockedTasks: 0,
      liveAgents: 0,
      readyAutomations: 0,
      connectedChannels: 0,
    },
    tasks: [],
    approvals: [],
    automations: [],
    channels: [],
    agents: buildAgents({ agents: [] }, [], pack),
    settings: [
      {
        id: "connection",
        label: "Gateway connection",
        current: "Unavailable",
        recommendation: "Set OPENCLAW_GATEWAY_URL and credentials.",
      },
    ],
    officeFeed: [],
    chat: [
      {
        id: "demo_chat_1",
        role: "system",
        text: "Mission Control is waiting for a live OpenClaw gateway connection.",
        timestamp: Date.now(),
      },
    ],
    proposals: [
      {
        id: "office-pack",
        title: "Enterprise office pack",
        summary: "Nova, Conductor, and specialist workspaces are ready for review.",
        status: "ready",
        patchPath: pack.patchPath,
        readmePath: pack.readmePath,
        highlights: [
          "Conductor orchestrates via cross-agent sessions instead of brittle nested spawn chains.",
          "Each specialist has a dedicated identity, quality bar, and output contract.",
          "The patch is designed as a proposal, not a blind live mutation.",
        ],
      },
    ],
  };
}

export async function getMissionControlSnapshot(): Promise<MissionSnapshot> {
  try {
    const bridge = getOpenClawBridge();
    await bridge.ensureConnected();

    const [agents, sessions, cron, channels, config, tasks, approvals, officeFeed] =
      await Promise.all([
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
        listStoredTasks(),
        listStoredApprovals(),
        listRecentMissionEvents(40),
      ]);
    let sessionKey = pickNovaSessionKey(bridge, agents);
    let chat: unknown;
    try {
      chat = await bridge.request("chat.history", {
        sessionKey,
        limit: 30,
      });
    } catch {
      sessionKey = bridge.mainSessionKey;
      try {
        chat = await bridge.request("chat.history", {
          sessionKey,
          limit: 30,
        });
      } catch {
        chat = { messages: [] };
      }
    }

    const pack = getAgentPackManifest();
    const ambientTasks = tasks.length ? [] : deriveAmbientTasks(sessions);
    const effectiveTasks = tasks.length ? tasks : ambientTasks;
    const effectiveChannels = buildChannels(channels);
    const effectiveAutomations = buildAutomations(cron);
    const effectiveAgents = buildAgents(agents, effectiveTasks, pack);
    const effectiveChat = toChatTranscript(chat);
    const settings = buildSettingsSummary(config, effectiveChannels.length);

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
        sessionKey,
        chatPlaceholder: "Ask Nova anything. She will brief Conductor and track the work here.",
      },
      overview: {
        activeTasks: effectiveTasks.filter((task) => task.status === "doing").length,
        waitingForYou: effectiveTasks.filter((task) => task.status === "waiting" || task.needsApproval).length,
        blockedTasks: effectiveTasks.filter((task) => task.status === "blocked").length,
        liveAgents: effectiveAgents.filter((agent) => agent.status === "live").length,
        readyAutomations: effectiveAutomations.filter((job) => job.enabled).length,
        connectedChannels: effectiveChannels.filter((channel) => channel.connected).length,
      },
      tasks: effectiveTasks.slice(0, 24),
      approvals,
      automations: effectiveAutomations,
      channels: effectiveChannels,
      agents: effectiveAgents,
      settings,
      officeFeed,
      chat: effectiveChat,
      proposals: [
        {
          id: "office-pack",
          title: "Enterprise office pack",
          summary: "Proposed multi-agent office files and config patch for OpenClaw.",
          status: "ready",
          patchPath: pack.patchPath,
          readmePath: pack.readmePath,
          highlights: [
            "Nova stays the only human-facing front door.",
            "Conductor coordinates specialists through cross-agent sessions, which fits OpenClaw better than nested subagent chains.",
            "Routine lanes can use a local light model first, while enterprise-grade specialists bias to GPT-5.2.",
          ],
        },
      ],
    };
  } catch (error) {
    return buildDemoSnapshot(
      error instanceof Error ? error.message : "Mission Control could not reach OpenClaw.",
    );
  }
}
