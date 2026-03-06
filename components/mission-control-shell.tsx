"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AgentEditorState,
  DashboardApproval,
  MissionEvent,
  MissionSnapshot,
} from "@/lib/mission-types";

type ViewId = "home" | "live" | "agents" | "automation" | "settings";

const views: Array<{ id: ViewId; label: string; blurb: string }> = [
  { id: "home", label: "Nova Home", blurb: "Your front door." },
  { id: "live", label: "Live Work", blurb: "Sessions and activity." },
  { id: "agents", label: "Agents", blurb: "Live team and editor." },
  { id: "automation", label: "Automation", blurb: "Actual cron jobs." },
  { id: "settings", label: "Settings", blurb: "Live config summary." },
];

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatRelativeTime(timestamp?: number, nowMs = Date.now()) {
  if (!timestamp) {
    return "just now";
  }
  const deltaSeconds = Math.max(0, Math.round((nowMs - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  return `${Math.round(deltaHours / 24)}d ago`;
}

function renderRawValue(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Raw payload unavailable.";
  }
}

function ApprovalActions(props: {
  approval: DashboardApproval;
  onResolve: (approvalId: string, decision: "allow-once" | "allow-always" | "deny") => Promise<void>;
}) {
  if (props.approval.decision !== "pending") {
    return <span className="pill pill-muted">{props.approval.decision}</span>;
  }

  return (
    <div className="approval-actions">
      <button type="button" className="button button-ghost" onClick={() => void props.onResolve(props.approval.id, "deny")}>
        Deny
      </button>
      <button type="button" className="button button-ghost" onClick={() => void props.onResolve(props.approval.id, "allow-once")}>
        Allow once
      </button>
      <button type="button" className="button button-primary" onClick={() => void props.onResolve(props.approval.id, "allow-always")}>
        Allow always
      </button>
    </div>
  );
}

export function MissionControlShell({ initialSnapshot }: { initialSnapshot: MissionSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [clockNowMs, setClockNowMs] = useState(initialSnapshot.generatedAtMs);
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [compactViewport, setCompactViewport] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialSnapshot.agents[0]?.id ?? null);
  const [agentEditor, setAgentEditor] = useState<AgentEditorState | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("AGENTS.md");
  const [fileContent, setFileContent] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const selectedAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [selectedAgentId, snapshot.agents],
  );

  const refreshSnapshot = useEffectEvent(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshing(true);
      startTransition(() => {
        void fetch("/api/dashboard", { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error("Dashboard refresh failed.");
            }
            return (await response.json()) as MissionSnapshot;
          })
          .then((nextSnapshot) => setSnapshot(nextSnapshot))
          .finally(() => setRefreshing(false));
      });
    }, 250);
  });

  const loadAgentEditor = useEffectEvent((agentId: string) => {
    setAgentBusy(true);
    setAgentError(null);
    void fetch(`/api/agents/${encodeURIComponent(agentId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Failed to load agent.");
        }
        return (await response.json()) as AgentEditorState;
      })
      .then((payload) => {
        setAgentEditor(payload);
        const firstFile = payload.files.find((file) => file.exists)?.name ?? payload.files[0]?.name ?? "AGENTS.md";
        setSelectedFileName(firstFile);
      })
      .catch((error) => {
        setAgentEditor(null);
        setAgentError(error instanceof Error ? error.message : "Failed to load agent.");
      })
      .finally(() => setAgentBusy(false));
  });

  const loadAgentFile = useEffectEvent((agentId: string, name: string) => {
    setFileBusy(true);
    void fetch(`/api/agents/${encodeURIComponent(agentId)}/files?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Failed to load file.");
        }
        return (await response.json()) as { content?: string };
      })
      .then((payload) => setFileContent(payload.content ?? ""))
      .catch((error) => {
        setFileContent(error instanceof Error ? error.message : "Failed to load file.");
      })
      .finally(() => setFileBusy(false));
  });

  useEffect(() => {
    setClockNowMs(Date.now());
    const intervalId = window.setInterval(() => setClockNowMs(Date.now()), 30_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1180px)");
    const syncLayout = (isCompact: boolean) => {
      setCompactViewport(isCompact);
      setLeftPanelOpen(!isCompact);
      setRightPanelOpen(!isCompact);
    };

    syncLayout(media.matches);
    const handleChange = (event: MediaQueryListEvent) => syncLayout(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!snapshot.connection.connected) {
      return;
    }
    const source = new EventSource("/api/events");
    const handler = (event: Event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as MissionEvent;
      setSnapshot((previous) => ({
        ...previous,
        officeFeed: [payload, ...previous.officeFeed.filter((entry) => entry.id !== payload.id)].slice(0, 40),
      }));
      refreshSnapshot();
    };
    source.addEventListener("mission", handler);
    return () => {
      source.removeEventListener("mission", handler);
      source.close();
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [refreshSnapshot, snapshot.connection.connected]);

  useEffect(() => {
    if (!snapshot.agents.length) {
      setSelectedAgentId(null);
      setAgentEditor(null);
      return;
    }
    if (!selectedAgentId || !snapshot.agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(snapshot.agents[0].id);
    }
  }, [selectedAgentId, snapshot.agents]);

  useEffect(() => {
    if (activeView !== "agents" || !selectedAgentId || !snapshot.connection.connected) {
      return;
    }
    loadAgentEditor(selectedAgentId);
  }, [activeView, loadAgentEditor, selectedAgentId, snapshot.connection.connected]);

  useEffect(() => {
    if (activeView !== "agents" || !selectedAgentId || !selectedFileName || !snapshot.connection.connected) {
      return;
    }
    loadAgentFile(selectedAgentId, selectedFileName);
  }, [activeView, loadAgentFile, selectedAgentId, selectedFileName, snapshot.connection.connected]);

  async function sendMessage() {
    const message = composer.trim();
    if (!message || chatBusy || !snapshot.nova.available) {
      return;
    }
    setChatBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        throw new Error("Chat send failed.");
      }
      setComposer("");
      refreshSnapshot();
    } finally {
      setChatBusy(false);
    }
  }

  async function resolveApproval(approvalId: string, decision: "allow-once" | "allow-always" | "deny") {
    const response = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: approvalId, decision }),
    });
    if (response.ok) {
      refreshSnapshot();
    }
  }

  async function saveAgentConfig() {
    if (!selectedAgentId || !agentEditor) {
      return;
    }
    setSavingConfig(true);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentEditor),
      });
      if (!response.ok) {
        throw new Error("Failed to save agent config.");
      }
      refreshSnapshot();
      loadAgentEditor(selectedAgentId);
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveAgentFile() {
    if (!selectedAgentId || !selectedFileName) {
      return;
    }
    setSavingFile(true);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgentId)}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedFileName, content: fileContent }),
      });
      if (!response.ok) {
        throw new Error("Failed to save agent file.");
      }
      loadAgentEditor(selectedAgentId);
    } finally {
      setSavingFile(false);
    }
  }

  function toggleLeftPanel() {
    setLeftPanelOpen((value) => {
      const next = !value;
      if (compactViewport && next) {
        setRightPanelOpen(false);
      }
      return next;
    });
  }

  function toggleRightPanel() {
    setRightPanelOpen((value) => {
      const next = !value;
      if (compactViewport && next) {
        setLeftPanelOpen(false);
      }
      return next;
    });
  }

  function closePanels() {
    setLeftPanelOpen(false);
    setRightPanelOpen(false);
  }

  const compactDrawerVisible = compactViewport && (leftPanelOpen || rightPanelOpen);

  if (!snapshot.connection.connected) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-backdrop" />
        {compactDrawerVisible ? <button type="button" className="panel-scrim panel-scrim-visible" aria-label="Close open panel" onClick={closePanels} /> : null}
        <header className="shell-topbar">
          <div>
            <p className="eyebrow">OpenClaw Desk</p>
            <h1>ClawDesk</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className={joinClasses("button", compactViewport && leftPanelOpen ? "button-primary" : "button-ghost")} onClick={toggleLeftPanel}>
              Menu
            </button>
            <button type="button" className={joinClasses("button", compactViewport && rightPanelOpen ? "button-primary" : "button-ghost")} onClick={toggleRightPanel}>
              Inspector
            </button>
            <span className="status-badge status-offline">OpenClaw offline</span>
            <button type="button" className="button button-ghost" onClick={refreshSnapshot}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>
        <div className="workspace-shell">
          <aside className={joinClasses("shell-panel", "shell-panel-left", leftPanelOpen && "shell-panel-open")}>
            <div className="sidebar-block">
              <div className="panel-head">
                <span className="eyebrow">Views</span>
                {compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}
              </div>
              <div className="view-stack">
                {views.map((view) => (
                  <button key={view.id} type="button" className="view-button" disabled>
                    <strong>{view.label}</strong>
                    <span>{view.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="shell-main">
            <section className="setup-panel">
              <div className="setup-copy">
                <span className="eyebrow">Live connection required</span>
                <h2>No mock data is shown here.</h2>
                <p>
                  The shell stays visible so you can judge the layout, but all content stays empty
                  until the dashboard can read real agents, sessions, approvals, automations, and config from OpenClaw.
                </p>
              </div>
              <div className="setup-grid">
                <article className="setup-card">
                  <strong>Main workspace</strong>
                  <p>Ready, but waiting for live OpenClaw data.</p>
                </article>
                <article className="setup-card">
                  <strong>Expected when connected</strong>
                  <p>Navigation, live work, and inspector will populate from the actual gateway.</p>
                </article>
                <article className="setup-card">
                  <strong>What is disabled</strong>
                  <p>Chat, agent editing, approvals, and automation control stay inactive until a live gateway is found.</p>
                </article>
                <article className="setup-card">
                  <strong>No synthetic fallback</strong>
                  <p>The dashboard will not invent agents, tasks, or chatter just to make the screen look busy.</p>
                </article>
              </div>
            </section>
          </section>

          <aside className={joinClasses("shell-panel", "shell-panel-right", rightPanelOpen && "shell-panel-open")}>
            <div className="sidebar-block">
              <div className="panel-head">
                <span className="eyebrow">Connection</span>
                {compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}
              </div>
              <article className="setup-card">
                <strong>Gateway URL</strong>
                <p>{snapshot.connection.gatewayUrl}</p>
              </article>
              <article className="setup-card">
                <strong>Last error</strong>
                <p>{snapshot.connection.lastError ?? "No error returned."}</p>
              </article>
              {snapshot.settings.map((item) => (
                <article key={item.id} className="setup-card">
                  <strong>{item.label}</strong>
                  <p>{item.current}</p>
                  {item.recommendation ? <small>{item.recommendation}</small> : null}
                </article>
              ))}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-backdrop" />
      {compactDrawerVisible ? <button type="button" className="panel-scrim panel-scrim-visible" aria-label="Close open panel" onClick={closePanels} /> : null}
      <header className="shell-topbar">
        <div>
          <p className="eyebrow">OpenClaw Desk</p>
          <h1>ClawDesk</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className={joinClasses("button", compactViewport && leftPanelOpen ? "button-primary" : "button-ghost")} onClick={toggleLeftPanel}>Menu</button>
          <button type="button" className={joinClasses("button", compactViewport && rightPanelOpen ? "button-primary" : "button-ghost")} onClick={toggleRightPanel}>Inspector</button>
          <span className="status-badge status-live">{snapshot.connection.serverVersion ?? "Connected"}</span>
          <button type="button" className="button button-ghost" onClick={refreshSnapshot}>{refreshing ? "Refreshing..." : "Refresh"}</button>
          <button type="button" className={joinClasses("button", advancedMode ? "button-primary" : "button-ghost")} onClick={() => setAdvancedMode((value) => !value)}>
            {advancedMode ? "Advanced on" : "Advanced off"}
          </button>
        </div>
      </header>

      <div className="workspace-shell">
        <aside className={joinClasses("shell-panel", "shell-panel-left", leftPanelOpen && "shell-panel-open")}>
          <div className="sidebar-block">
            <div className="panel-head">
              <span className="eyebrow">Views</span>
              {compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}
            </div>
            <div className="view-stack">
              {views.map((view) => (
                <button key={view.id} type="button" className={joinClasses("view-button", activeView === view.id && "view-button-active")} onClick={() => setActiveView(view.id)}>
                  <strong>{view.label}</strong>
                  <span>{view.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-block">
            <span className="eyebrow">Live counts</span>
            <div className="metric-grid">
              <article className="metric-tile"><span>Open sessions</span><strong>{snapshot.overview.openSessions}</strong><small>sessions.list</small></article>
              <article className="metric-tile"><span>Waiting</span><strong>{snapshot.overview.waitingForYou}</strong><small>approvals</small></article>
              <article className="metric-tile"><span>Errors</span><strong>{snapshot.overview.recentErrors}</strong><small>recent feed</small></article>
              <article className="metric-tile"><span>Agents</span><strong>{snapshot.overview.liveAgents}</strong><small>live now</small></article>
              <article className="metric-tile"><span>Cron jobs</span><strong>{snapshot.overview.readyAutomations}</strong><small>enabled</small></article>
              <article className="metric-tile"><span>Channels</span><strong>{snapshot.overview.connectedChannels}</strong><small>connected</small></article>
            </div>
          </div>
        </aside>

        <section className="shell-main">
          {activeView === "home" && (
            <article className="surface-card chat-surface">
              <header className="section-head"><div><span className="eyebrow">Nova Home</span><h2>{snapshot.nova.available ? "Talk to Nova" : "Nova is not configured"}</h2></div><span className="pill pill-muted">{snapshot.nova.sessionKey}</span></header>
              <div className="chat-log">
                {snapshot.chat.length ? snapshot.chat.map((message) => (
                  <article key={message.id} className={joinClasses("chat-row", `chat-${message.role}`)}>
                    <header><strong>{message.role}</strong><span>{formatRelativeTime(message.timestamp, clockNowMs)}</span></header>
                    <p>{message.text}</p>
                  </article>
                )) : <p className="empty-state">No live transcript returned yet.</p>}
              </div>
              <div className="composer-block">
                <textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={snapshot.nova.chatPlaceholder} rows={6} disabled={!snapshot.nova.available || chatBusy} />
                <div className="composer-footer">
                  <span>{snapshot.nova.available ? "This sends a real chat.send request." : "Create a live Nova agent in OpenClaw to use this screen."}</span>
                  <button type="button" className="button button-primary" disabled={!snapshot.nova.available || chatBusy} onClick={() => void sendMessage()}>{chatBusy ? "Sending..." : "Send to Nova"}</button>
                </div>
              </div>
            </article>
          )}

          {activeView === "live" && (
            <article className="surface-card">
              <header className="section-head"><div><span className="eyebrow">Live sessions</span><h2>Actual OpenClaw session activity</h2></div></header>
              <div className="list-grid">
                {snapshot.sessions.length ? snapshot.sessions.map((session) => (
                  <article key={session.id} className="list-card">
                    <header><div><span className="eyebrow">Session</span><h3>{session.title}</h3></div><span className="pill pill-muted">{session.stateLabel}</span></header>
                    <p>{session.summary}</p>
                    <div className="meta-row"><span>{session.agentId ?? "No agent id"}</span><span>{formatRelativeTime(session.lastActiveAtMs, clockNowMs)}</span></div>
                    <code className="session-key">{session.key}</code>
                  </article>
                )) : <p className="empty-state">OpenClaw did not return any sessions.</p>}
              </div>
            </article>
          )}

          {activeView === "agents" && (
            <article className="surface-card">
              <header className="section-head"><div><span className="eyebrow">Live agents</span><h2>Actual agents from OpenClaw</h2></div></header>
              <div className="list-grid">
                {snapshot.agents.length ? snapshot.agents.map((agent) => (
                  <button key={agent.id} type="button" className={joinClasses("list-card", agent.id === selectedAgentId && "list-card-active")} onClick={() => { setSelectedAgentId(agent.id); setRightPanelOpen(true); }}>
                    <header><div><span className="eyebrow">Agent</span><h3>{agent.name}</h3></div><span className={joinClasses("pill", agent.status === "live" && "pill-ok")}>{agent.status}</span></header>
                    <div className="meta-row"><span>{agent.model || "Inherited / unset"}</span><span>{agent.sessionCount} sessions</span></div>
                    <p>{agent.lastSessionTitle ?? "No recent session returned."}</p>
                  </button>
                )) : <p className="empty-state">No agents were returned by OpenClaw.</p>}
              </div>
            </article>
          )}

          {activeView === "automation" && (
            <article className="surface-card">
              <header className="section-head"><div><span className="eyebrow">Automation</span><h2>Actual OpenClaw cron jobs</h2></div></header>
              <div className="list-grid">
                {snapshot.automations.length ? snapshot.automations.map((job) => (
                  <article key={job.id} className="list-card">
                    <header><div><span className="eyebrow">Automation</span><h3>{job.name}</h3></div><span className={joinClasses("pill", job.status === "healthy" && "pill-ok", job.status === "warning" && "pill-warn")}>{job.status}</span></header>
                    <p>{job.summary}</p>
                    <div className="meta-row"><span>{job.enabled ? "Enabled" : "Disabled"}</span><span>{job.schedule}</span></div>
                  </article>
                )) : <p className="empty-state">No cron jobs were returned by OpenClaw.</p>}
              </div>
            </article>
          )}

          {activeView === "settings" && (
            <article className="surface-card">
              <header className="section-head"><div><span className="eyebrow">Live settings</span><h2>Current OpenClaw configuration summary</h2></div></header>
              <div className="list-grid">
                {snapshot.settings.map((item) => (
                  <article key={item.id} className="list-card">
                    <header><div><span className="eyebrow">Config</span><h3>{item.label}</h3></div></header>
                    <p>{item.current}</p>
                    {item.recommendation ? <small>{item.recommendation}</small> : null}
                  </article>
                ))}
              </div>
            </article>
          )}
        </section>

        <aside className={joinClasses("shell-panel", "shell-panel-right", rightPanelOpen && "shell-panel-open")}>
          {(activeView === "home" || activeView === "live") && (
            <>
              <div className="sidebar-block"><div className="panel-head"><span className="eyebrow">Approvals</span>{compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}</div><div className="stack-list">{snapshot.approvals.length ? snapshot.approvals.map((approval) => (
                <article key={approval.id} className="list-card compact-card">
                  <header><div><h3>{approval.title}</h3></div><span className="pill pill-warn">{formatRelativeTime(approval.requestedAtMs, clockNowMs)}</span></header>
                  <p>{approval.detail}</p>
                  <ApprovalActions approval={approval} onResolve={resolveApproval} />
                </article>
              )) : <p className="empty-state">Nothing is waiting for approval.</p>}</div></div>
              <div className="sidebar-block"><span className="eyebrow">Office pulse</span><div className="stack-list">{snapshot.officeFeed.length ? snapshot.officeFeed.map((event) => (
                <article key={event.id} className={joinClasses("list-card", "compact-card", `feed-${event.severity}`)}>
                  <header><div><h3>{event.title}</h3></div><span className="pill pill-muted">{formatRelativeTime(event.ts, clockNowMs)}</span></header>
                  <p>{event.message}</p>
                  <div className="meta-row"><span>{event.agentId ?? "system"}</span><span>{event.sessionKey ?? "no session"}</span></div>
                  {advancedMode && event.raw ? <details className="advanced-details"><summary>Advanced details</summary><pre>{renderRawValue(event.raw)}</pre></details> : null}
                </article>
              )) : <p className="empty-state">No live events have been received yet.</p>}</div></div>
            </>
          )}

          {activeView === "agents" && (
            <div className="sidebar-block">
              <div className="panel-head">
                <span className="eyebrow">Agent editor</span>
                {compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}
              </div>
              {agentBusy ? <p className="empty-state">Loading live agent editor...</p> : null}
              {agentError ? <p className="empty-state">{agentError}</p> : null}
              {!agentBusy && !agentError && agentEditor ? (
                <>
                  <article className="editor-notice"><strong>Live writeback</strong><p>Config edits call <code>config.patch</code>. File edits write into the live agent workspace.</p></article>
                  <div className="field-grid">
                    <label className="field"><span>Name</span><input value={agentEditor.name} onChange={(event) => setAgentEditor((current) => current ? { ...current, name: event.target.value } : current)} /></label>
                    <label className="field"><span>Model</span><input value={agentEditor.model} onChange={(event) => setAgentEditor((current) => current ? { ...current, model: event.target.value } : current)} /></label>
                    <label className="field"><span>Workspace</span><input value={agentEditor.workspacePath} onChange={(event) => setAgentEditor((current) => current ? { ...current, workspacePath: event.target.value } : current)} /></label>
                    <label className="field"><span>Agent dir</span><input value={agentEditor.agentDir} onChange={(event) => setAgentEditor((current) => current ? { ...current, agentDir: event.target.value } : current)} /></label>
                    <label className="field"><span>Heartbeat</span><input value={agentEditor.heartbeatEvery} onChange={(event) => setAgentEditor((current) => current ? { ...current, heartbeatEvery: event.target.value } : current)} /></label>
                    <label className="field"><span>Sandbox</span><input value={agentEditor.sandboxMode} onChange={(event) => setAgentEditor((current) => current ? { ...current, sandboxMode: event.target.value } : current)} /></label>
                    <label className="field"><span>Identity name</span><input value={agentEditor.identityName} onChange={(event) => setAgentEditor((current) => current ? { ...current, identityName: event.target.value } : current)} /></label>
                    <label className="field"><span>Identity theme</span><input value={agentEditor.identityTheme} onChange={(event) => setAgentEditor((current) => current ? { ...current, identityTheme: event.target.value } : current)} /></label>
                    <label className="field"><span>Identity emoji</span><input value={agentEditor.identityEmoji} onChange={(event) => setAgentEditor((current) => current ? { ...current, identityEmoji: event.target.value } : current)} /></label>
                  </div>
                  <div className="editor-actions"><button type="button" className="button button-primary" disabled={savingConfig} onClick={() => void saveAgentConfig()}>{savingConfig ? "Saving config..." : "Save config"}</button></div>
                  <div className="file-tab-row">{agentEditor.files.map((file) => <button key={file.name} type="button" className={joinClasses("file-tab", selectedFileName === file.name && "file-tab-active")} onClick={() => setSelectedFileName(file.name)}>{file.name}{file.exists ? "" : " (new)"}</button>)}</div>
                  <label className="field"><span>{selectedFileName}</span><textarea value={fileContent} onChange={(event) => setFileContent(event.target.value)} rows={14} disabled={fileBusy} /></label>
                  <div className="editor-actions"><button type="button" className="button button-primary" disabled={savingFile || fileBusy} onClick={() => void saveAgentFile()}>{savingFile ? "Saving file..." : "Save file"}</button></div>
                </>
              ) : null}
            </div>
          )}

          {(activeView === "automation" || activeView === "settings") && (
            <div className="sidebar-block">
              <div className="panel-head">
                <span className="eyebrow">Inspector</span>
                {compactViewport ? <button type="button" className="button button-ghost panel-close" onClick={closePanels}>Close</button> : null}
              </div>
              <article className="editor-notice"><strong>Strict mode</strong><p>Anything fake has been removed. These panels only read verified OpenClaw state, and agent edits write back through live config and workspace files.</p></article>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
