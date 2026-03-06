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
  DashboardApproval,
  DashboardTask,
  MissionEvent,
  MissionSnapshot,
  TaskStatus,
} from "@/lib/mission-types";

type ViewId = "home" | "office" | "tasks" | "agents" | "automation" | "settings";

const views: Array<{ id: ViewId; label: string; blurb: string }> = [
  { id: "home", label: "Nova Home", blurb: "Chat first." },
  { id: "office", label: "Office Live", blurb: "Realtime chatter." },
  { id: "tasks", label: "Task Board", blurb: "Status and blockers." },
  { id: "agents", label: "Agents", blurb: "Team overview." },
  { id: "automation", label: "Automation", blurb: "Recurring work." },
  { id: "settings", label: "Settings", blurb: "Review before change." },
];

const boardColumns: Array<{ id: TaskStatus; label: string }> = [
  { id: "inbox", label: "Inbox" },
  { id: "planned", label: "Planned" },
  { id: "doing", label: "Doing" },
  { id: "waiting", label: "Waiting for You" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
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
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function buildAutomationDraft(goal: string, cadence: string, sessionKey: string) {
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) {
    return null;
  }
  const schedule =
    cadence === "morning"
      ? { kind: "cron", expr: "0 8 * * *", tz: "Europe/Copenhagen" }
      : cadence === "heartbeat"
        ? { kind: "every", everyMs: 30 * 60 * 1000 }
        : { kind: "cron", expr: "0 18 * * 1-5", tz: "Europe/Copenhagen" };

  return {
    name: trimmedGoal.length > 48 ? `${trimmedGoal.slice(0, 45)}...` : trimmedGoal,
    description: "Drafted in Mission Control for review before creating an OpenClaw cron job.",
    sessionTarget: "isolated",
    wakeMode: "now",
    agentId: "automation",
    sessionKey,
    schedule,
    payload: {
      kind: "agentTurn",
      message: trimmedGoal,
      thinking: cadence === "heartbeat" ? "low" : "medium",
      deliver: false,
      lightContext: cadence === "heartbeat",
    },
  };
}

function MetricCard(props: { label: string; value: number; note: string }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{props.label}</span>
      <strong className="metric-value">{props.value}</strong>
      <p className="metric-note">{props.note}</p>
    </article>
  );
}

function TaskPill(props: { status: TaskStatus }) {
  return <span className={joinClasses("task-pill", `task-pill-${props.status}`)}>{props.status}</span>;
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
    return <span className="approval-decision">{props.approval.decision}</span>;
  }

  return (
    <div className="approval-actions">
      <button
        type="button"
        className="button button-ghost"
        onClick={() => void props.onResolve(props.approval.id, "deny")}
      >
        Deny
      </button>
      <button
        type="button"
        className="button button-ghost"
        onClick={() => void props.onResolve(props.approval.id, "allow-once")}
      >
        Allow once
      </button>
      <button
        type="button"
        className="button button-primary"
        onClick={() => void props.onResolve(props.approval.id, "allow-always")}
      >
        Allow always
      </button>
    </div>
  );
}

export function MissionControlShell({ initialSnapshot }: { initialSnapshot: MissionSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [clockNowMs, setClockNowMs] = useState(initialSnapshot.generatedAtMs);
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [composer, setComposer] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [automationGoal, setAutomationGoal] = useState("");
  const [automationCadence, setAutomationCadence] = useState("morning");
  const refreshTimerRef = useRef<number | null>(null);

  const tasksByStatus = useMemo(() => {
    const grouped = new Map<TaskStatus, DashboardTask[]>();
    for (const task of snapshot.tasks) {
      const list = grouped.get(task.status) ?? [];
      list.push(task);
      grouped.set(task.status, list);
    }
    return grouped;
  }, [snapshot.tasks]);

  const automationDraft = useMemo(
    () => buildAutomationDraft(automationGoal, automationCadence, snapshot.nova.sessionKey),
    [automationCadence, automationGoal, snapshot.nova.sessionKey],
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
          .then((nextSnapshot) => {
            setSnapshot(nextSnapshot);
          })
          .finally(() => {
            setRefreshing(false);
          });
      });
    }, 450);
  });

  useEffect(() => {
    setClockNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
    };
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
        officeFeed: [payload, ...previous.officeFeed].slice(0, 40),
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

  async function sendMessage() {
    const message = composer.trim();
    if (!message || chatBusy) {
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

  async function resolveApproval(
    approvalId: string,
    decision: "allow-once" | "allow-always" | "deny",
  ) {
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: approvalId, decision }),
    });
    refreshSnapshot();
  }

  return (
    <main className="mission-shell">
      <div className="mission-background" />
      <header className="mission-topbar">
        <div>
          <p className="eyebrow">Mission Control</p>
          <h1>Nova&apos;s office, rendered for a human.</h1>
        </div>
        <div className="topbar-status">
          <span
            className={joinClasses(
              "status-dot",
              snapshot.connection.connected ? "status-live" : "status-demo",
            )}
          />
          <div>
            <strong>{snapshot.connection.connected ? "Connected to OpenClaw" : "Demo mode"}</strong>
            <p>
              {snapshot.connection.serverVersion
                ? `Server ${snapshot.connection.serverVersion}`
                : snapshot.connection.lastError ?? "Waiting for gateway access."}
            </p>
          </div>
          <button type="button" className="button button-ghost" onClick={refreshSnapshot}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className={joinClasses("button", advancedMode ? "button-primary" : "button-ghost")}
            onClick={() => setAdvancedMode((current) => !current)}
          >
            {advancedMode ? "Advanced on" : "Advanced off"}
          </button>
        </div>
      </header>

      <section className="mission-hero">
        <div className="hero-copy">
          <span className="hero-kicker">Chat-first personal control center</span>
          <h2>Nova is the front desk. Conductor runs the office. Specialists carry the work.</h2>
          <p>
            Mission Control keeps the office legible: what is running, what is blocked, what needs
            your approval, and what OpenClaw should change next.
          </p>
        </div>
        <div className="metrics-grid">
          <MetricCard label="Active tasks" value={snapshot.overview.activeTasks} note="Work currently moving." />
          <MetricCard label="Waiting for you" value={snapshot.overview.waitingForYou} note="Approvals and decisions." />
          <MetricCard label="Blocked" value={snapshot.overview.blockedTasks} note="Needs intervention." />
          <MetricCard label="Live agents" value={snapshot.overview.liveAgents} note="Specialists ready now." />
          <MetricCard label="Automations" value={snapshot.overview.readyAutomations} note="Scheduled workload." />
          <MetricCard label="Connected channels" value={snapshot.overview.connectedChannels} note="External surfaces online." />
        </div>
      </section>

      <nav className="view-nav" aria-label="Mission sections">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={joinClasses("view-tab", activeView === view.id && "view-tab-active")}
            onClick={() => setActiveView(view.id)}
          >
            <strong>{view.label}</strong>
            <span>{view.blurb}</span>
          </button>
        ))}
      </nav>

      {activeView === "home" && (
        <section className="view-grid view-grid-home">
          <article className="panel panel-chat">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Nova Home</p>
                <h3>Talk to Nova</h3>
              </div>
              <span className="meta-chip">{snapshot.nova.sessionKey}</span>
            </div>
            <div className="chat-transcript">
              {snapshot.chat.map((message) => (
                <article key={message.id} className={joinClasses("chat-bubble", `chat-${message.role}`)}>
                  <header>
                    <strong>{message.role}</strong>
                    <span>{formatRelativeTime(message.timestamp, clockNowMs)}</span>
                  </header>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
            <div className="chat-composer">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                placeholder={snapshot.nova.chatPlaceholder}
                rows={5}
              />
              <div className="composer-actions">
                <span>Nova will route the work and the office view will update as it happens.</span>
                <button type="button" className="button button-primary" onClick={() => void sendMessage()}>
                  {chatBusy ? "Sending..." : "Send to Nova"}
                </button>
              </div>
            </div>
          </article>

          <div className="stack">
            <article className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Office map</p>
                  <h3>How the team is arranged</h3>
                </div>
              </div>
              <div className="office-lanes">
                <article className="lane-card lane-primary">
                  <span>Nova</span>
                  <strong>Only point of entry</strong>
                  <p>Turns your request into a clear brief and keeps the conversation human.</p>
                </article>
                <article className="lane-card lane-secondary">
                  <span>Conductor</span>
                  <strong>Runs the office</strong>
                  <p>Owns plan, delegation, blockers, approvals, and next action.</p>
                </article>
                <article className="lane-card lane-tertiary">
                  <span>Specialists</span>
                  <strong>Research, build, review, write, automate, operate</strong>
                  <p>Each lane stays inside its guardrails and reports back through Conductor.</p>
                </article>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Waiting for you</p>
                  <h3>Approvals and decisions</h3>
                </div>
              </div>
              <div className="approval-list">
                {snapshot.approvals.length ? (
                  snapshot.approvals.slice(0, 4).map((approval) => (
                    <article key={approval.id} className="approval-card">
                      <div>
                        <strong>{approval.title}</strong>
                        <p>{approval.detail}</p>
                      </div>
                      <small>{formatRelativeTime(approval.requestedAtMs, clockNowMs)}</small>
                      <ApprovalActions approval={approval} onResolve={resolveApproval} />
                    </article>
                  ))
                ) : (
                  <p className="empty-state">Nothing is waiting on you right now.</p>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Current office pulse</p>
                  <h3>Latest chatter</h3>
                </div>
              </div>
              <div className="feed-list">
                {snapshot.officeFeed.length ? (
                  snapshot.officeFeed.slice(0, 5).map((event) => (
                    <article key={event.id} className={joinClasses("feed-card", `feed-${event.severity}`)}>
                      <header>
                        <strong>{event.title}</strong>
                        <span>{formatRelativeTime(event.ts, clockNowMs)}</span>
                      </header>
                      <p>{event.message}</p>
                      {advancedMode && event.raw ? (
                        <details className="advanced-details">
                          <summary>Advanced details</summary>
                          <pre className="raw-pre">{renderRawValue(event.raw)}</pre>
                        </details>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="empty-state">Live chatter will appear here once Mission Control is connected.</p>
                )}
              </div>
            </article>
          </div>
        </section>
      )}

      {activeView === "office" && (
        <section className="view-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Office Live</p>
                <h3>Follow the work as if you were standing in the room</h3>
              </div>
            </div>
            <div className="office-feed">
              {snapshot.officeFeed.length ? (
                snapshot.officeFeed.map((event) => (
                  <article key={event.id} className={joinClasses("office-line", `feed-${event.severity}`)}>
                    <div className="office-line-meta">
                      <strong>{event.title}</strong>
                      <span>{event.agentId ?? "system"}</span>
                      <small>{formatRelativeTime(event.ts, clockNowMs)}</small>
                    </div>
                    <p>{event.message}</p>
                    {advancedMode && event.raw ? (
                      <details className="advanced-details">
                        <summary>Advanced details</summary>
                        <pre className="raw-pre">{renderRawValue(event.raw)}</pre>
                      </details>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="empty-state">No live office chatter yet. Connect OpenClaw and the work stream will appear here.</p>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Channel state</p>
                <h3>External surfaces</h3>
              </div>
            </div>
            <div className="channel-list">
              {snapshot.channels.length ? (
                snapshot.channels.map((channel) => (
                  <article key={channel.id} className="channel-card">
                    <div>
                      <strong>{channel.label}</strong>
                      <p>{channel.detail}</p>
                    </div>
                    <span className={joinClasses("meta-chip", `channel-${channel.status}`)}>{channel.status}</span>
                  </article>
                ))
              ) : (
                <p className="empty-state">No external channels are surfaced yet.</p>
              )}
            </div>
          </article>
        </section>
      )}

      {activeView === "tasks" && (
        <section className="task-board">
          {boardColumns.map((column) => (
            <article key={column.id} className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Task board</p>
                  <h3>{column.label}</h3>
                </div>
              </div>
              <div className="task-column">
                {(tasksByStatus.get(column.id) ?? []).map((task) => (
                  <article key={task.id} className="task-card">
                    <header>
                      <TaskPill status={task.status} />
                      <small>{formatRelativeTime(task.updatedAtMs, clockNowMs)}</small>
                    </header>
                    <strong>{task.title}</strong>
                    <p>{task.summary}</p>
                    {task.nextStep ? <p className="task-next">Next: {task.nextStep}</p> : null}
                    {task.blockers.length ? <p className="task-alert">Blocker: {task.blockers[0]}</p> : null}
                  </article>
                ))}
                {!(tasksByStatus.get(column.id) ?? []).length && (
                  <p className="empty-state">No tasks in this column.</p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {activeView === "agents" && (
        <section className="cards-grid">
          {snapshot.agents.map((agent) => (
            <article key={agent.id} className="panel agent-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{agent.status === "live" ? "Live agent" : "Planned agent"}</p>
                <h3>{agent.name}</h3>
              </div>
                <span className={joinClasses("meta-chip", agent.status === "live" && "meta-chip-live")}>
                  {agent.status}
                </span>
              </div>
              <p className="agent-title">{agent.title}</p>
              <p>{agent.soul}</p>
              <dl className="fact-list">
                <div>
                  <dt>Current focus</dt>
                  <dd>{agent.currentFocus}</dd>
                </div>
                <div>
                  <dt>Workload</dt>
                  <dd>{agent.workload}</dd>
                </div>
                <div>
                  <dt>Quality standard</dt>
                  <dd>{agent.qualityBar}</dd>
                </div>
                <div>
                  <dt>Reasoning depth</dt>
                  <dd>{agent.reasoningMode}</dd>
                </div>
              </dl>
              {advancedMode ? (
                <div className="agent-extra">
                  <p>
                    <strong>Model strategy:</strong> {agent.modelStrategy}
                  </p>
                  <p>
                    <strong>Output home:</strong> {agent.outputHome}
                  </p>
                  <p>
                    <strong>Live task count:</strong> {agent.liveTasks}
                  </p>
                  <p>
                    <strong>Workspace:</strong> {agent.workspacePath}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      {activeView === "automation" && (
        <section className="view-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Automation overview</p>
                <h3>OpenClaw cron jobs surfaced in plain language</h3>
              </div>
            </div>
            <div className="automation-list">
              {snapshot.automations.map((job) => (
                <article key={job.id} className="automation-card">
                  <header>
                    <strong>{job.name}</strong>
                    <span className={joinClasses("meta-chip", `channel-${job.status === "healthy" ? "ready" : job.status === "warning" ? "attention" : "offline"}`)}>
                      {job.status}
                    </span>
                  </header>
                  <p>{job.summary}</p>
                  <small>
                    {job.enabled ? "Enabled" : "Disabled"} | {job.schedule}
                  </small>
                </article>
              ))}
              {!snapshot.automations.length && <p className="empty-state">No surfaced OpenClaw cron jobs yet.</p>}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Automation drafter</p>
                <h3>Build a safe draft</h3>
              </div>
            </div>
            <label className="field">
              <span>What should happen?</span>
              <textarea
                value={automationGoal}
                onChange={(event) => setAutomationGoal(event.target.value)}
                rows={5}
                placeholder="Example: Every weekday morning, ask Automation to review pending task blockers and bring urgent ones back to Nova."
              />
            </label>
            <label className="field">
              <span>Cadence</span>
              <select value={automationCadence} onChange={(event) => setAutomationCadence(event.target.value)}>
                <option value="morning">Every morning</option>
                <option value="heartbeat">Every 30 minutes</option>
                <option value="evening">Weekday evening</option>
              </select>
            </label>
            <div className="draft-preview">
              <p className="eyebrow">Draft preview</p>
              <pre>{automationDraft ? JSON.stringify(automationDraft, null, 2) : "Describe the automation to generate a safe draft."}</pre>
            </div>
          </article>
        </section>
      )}

      {activeView === "settings" && (
        <section className="view-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Human-readable settings</p>
                <h3>What OpenClaw is doing now, and what we should change next</h3>
              </div>
            </div>
            <div className="settings-grid">
              {snapshot.settings.map((item) => (
                <article key={item.id} className="setting-card">
                  <strong>{item.label}</strong>
                  <p>{item.current}</p>
                  {item.recommendation ? <small>{item.recommendation}</small> : null}
                </article>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Review pack</p>
                <h3>Proposed OpenClaw office upgrade</h3>
              </div>
            </div>
            {snapshot.proposals.map((proposal) => (
              <article key={proposal.id} className="proposal-card">
                <header>
                  <strong>{proposal.title}</strong>
                  <span className="meta-chip">{proposal.status}</span>
                </header>
                <p>{proposal.summary}</p>
                <ul className="proposal-list">
                  {proposal.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
                <p className="proposal-note">Included with this project: the office patch proposal and the review guide.</p>
                {advancedMode ? (
                  <div className="path-stack">
                    <code>{proposal.patchPath}</code>
                    <code>{proposal.readmePath}</code>
                  </div>
                ) : null}
                {advancedMode ? (
                  <p className="proposal-note">
                    Review-first is intentional. Reconcile this pack with your live OpenClaw config before applying
                    any change.
                  </p>
                ) : null}
              </article>
            ))}
          </article>
        </section>
      )}
    </main>
  );
}

