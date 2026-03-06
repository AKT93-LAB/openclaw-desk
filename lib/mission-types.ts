export type ConnectionMode = "live" | "offline";

export type MissionEventKind =
  | "gateway.connected"
  | "gateway.disconnected"
  | "chat.delta"
  | "chat.final"
  | "chat.error"
  | "chat.aborted"
  | "agent.lifecycle"
  | "agent.tool"
  | "agent.note"
  | "approval.requested"
  | "approval.resolved"
  | "cron.update"
  | "presence.update"
  | "health.update"
  | "system.notice";

export type MissionEventSeverity = "info" | "warn" | "error";

export type MissionEvent = {
  id: string;
  kind: MissionEventKind;
  ts: number;
  title: string;
  message: string;
  severity: MissionEventSeverity;
  agentId?: string;
  runId?: string;
  sessionKey?: string;
  raw?: unknown;
};

export type ChatTranscriptItem = {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "other";
  text: string;
  timestamp: number;
  runId?: string;
};

export type ChatTranscriptRole = ChatTranscriptItem["role"];

export type DashboardSession = {
  id: string;
  key: string;
  title: string;
  summary: string;
  agentId?: string;
  stateLabel: string;
  lastActiveAtMs?: number;
};

export type DashboardApproval = {
  id: string;
  title: string;
  detail: string;
  decision: "pending" | "allow-once" | "allow-always" | "deny";
  requestedAtMs: number;
  expiresAtMs?: number;
  runId?: string;
  sessionKey?: string;
  agentId?: string;
};

export type DashboardAutomation = {
  id: string;
  name: string;
  summary: string;
  enabled: boolean;
  status: "healthy" | "warning" | "idle";
  schedule: string;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  agentId?: string;
};

export type DashboardChannel = {
  id: string;
  label: string;
  configured: boolean;
  connected: boolean;
  status: "ready" | "attention" | "offline";
  detail: string;
};

export type DashboardAgent = {
  id: string;
  name: string;
  status: "live" | "configured";
  model: string;
  workspacePath: string;
  agentDir: string;
  heartbeatEvery?: string;
  sandboxMode?: string;
  identityName?: string;
  identityTheme?: string;
  identityEmoji?: string;
  sessionCount: number;
  lastSessionTitle?: string;
};

export type SettingsSummaryItem = {
  id: string;
  label: string;
  current: string;
  recommendation?: string;
};

export type EditableAgentFile = {
  name: string;
  exists: boolean;
};

export type AgentEditorState = {
  id: string;
  name: string;
  model: string;
  workspacePath: string;
  agentDir: string;
  heartbeatEvery: string;
  sandboxMode: string;
  identityName: string;
  identityTheme: string;
  identityEmoji: string;
  files: EditableAgentFile[];
};

export type MissionSnapshot = {
  mode: ConnectionMode;
  generatedAtMs: number;
  connection: {
    mode: ConnectionMode;
    connected: boolean;
    gatewayUrl: string;
    serverVersion?: string;
    lastError?: string;
  };
  nova: {
    available: boolean;
    sessionKey: string;
    chatPlaceholder: string;
  };
  overview: {
    openSessions: number;
    waitingForYou: number;
    recentErrors: number;
    liveAgents: number;
    readyAutomations: number;
    connectedChannels: number;
  };
  sessions: DashboardSession[];
  approvals: DashboardApproval[];
  automations: DashboardAutomation[];
  channels: DashboardChannel[];
  agents: DashboardAgent[];
  settings: SettingsSummaryItem[];
  officeFeed: MissionEvent[];
  chat: ChatTranscriptItem[];
};
