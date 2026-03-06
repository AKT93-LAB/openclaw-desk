export type ConnectionMode = "live" | "demo";

export type TaskStatus = "inbox" | "planned" | "doing" | "blocked" | "waiting" | "done";

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

export type DashboardTask = {
  id: string;
  title: string;
  summary: string;
  status: TaskStatus;
  source: "nova-chat" | "ambient-session" | "automation";
  ownerAgentId?: string;
  sessionKey?: string;
  runId?: string;
  needsApproval: boolean;
  blockers: string[];
  missing: string[];
  completed: string[];
  nextStep?: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastEvent?: string;
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
  title: string;
  soul: string;
  status: "live" | "planned" | "attention";
  modelStrategy: string;
  reasoningMode: string;
  qualityBar: string;
  currentFocus: string;
  workload: string;
  liveTasks: number;
  outputHome: string;
  workspacePath: string;
};

export type SettingsSummaryItem = {
  id: string;
  label: string;
  current: string;
  recommendation?: string;
};

export type ProposalCard = {
  id: string;
  title: string;
  summary: string;
  status: "ready" | "review";
  patchPath: string;
  readmePath: string;
  highlights: string[];
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
    sessionKey: string;
    chatPlaceholder: string;
  };
  overview: {
    activeTasks: number;
    waitingForYou: number;
    blockedTasks: number;
    liveAgents: number;
    readyAutomations: number;
    connectedChannels: number;
  };
  tasks: DashboardTask[];
  approvals: DashboardApproval[];
  automations: DashboardAutomation[];
  channels: DashboardChannel[];
  agents: DashboardAgent[];
  settings: SettingsSummaryItem[];
  officeFeed: MissionEvent[];
  chat: ChatTranscriptItem[];
  proposals: ProposalCard[];
};
