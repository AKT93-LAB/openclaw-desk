import { appendJsonLine, readJsonFile, readJsonLines, writeJsonFile } from "@/lib/persistence";
import type { DashboardApproval, DashboardTask, MissionEvent } from "@/lib/mission-types";

const TASKS_FILE = "mission/tasks.json";
const APPROVALS_FILE = "mission/approvals.json";
const EVENT_LOG_FILE = "mission/events.jsonl";

function compactText(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function buildTaskTitle(message: string) {
  const normalized = compactText(message, "New task");
  return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
}

export async function listStoredTasks() {
  return await readJsonFile<DashboardTask[]>(TASKS_FILE, []);
}

export async function listStoredApprovals() {
  return await readJsonFile<DashboardApproval[]>(APPROVALS_FILE, []);
}

export async function listRecentMissionEvents(limit = 30) {
  return await readJsonLines<MissionEvent>(EVENT_LOG_FILE, limit);
}

export async function createTaskFromChat(params: {
  sessionKey: string;
  message: string;
  ownerAgentId?: string;
}) {
  const tasks = await listStoredTasks();
  const now = Date.now();
  const task: DashboardTask = {
    id: `task_${now.toString(36)}`,
    title: buildTaskTitle(params.message),
    summary: compactText(params.message, "No summary yet."),
    status: "doing",
    source: "nova-chat",
    ownerAgentId: params.ownerAgentId,
    sessionKey: params.sessionKey,
    needsApproval: false,
    blockers: [],
    missing: [],
    completed: [],
    nextStep: "Nova is briefing Conductor.",
    createdAtMs: now,
    updatedAtMs: now,
    lastEvent: "Queued from Nova chat.",
  };
  tasks.unshift(task);
  await writeJsonFile(TASKS_FILE, tasks);
  return task;
}

export async function linkTaskToRun(taskId: string, runId: string) {
  const tasks = await listStoredTasks();
  const nextTasks = tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          runId,
          updatedAtMs: Date.now(),
          lastEvent: "OpenClaw accepted the run.",
          nextStep: "Waiting for live agent activity.",
        }
      : task,
  );
  await writeJsonFile(TASKS_FILE, nextTasks);
}

export async function recordMissionEvent(event: MissionEvent) {
  await appendJsonLine(EVENT_LOG_FILE, event);
  await syncStoresFromEvent(event);
}

async function syncStoresFromEvent(event: MissionEvent) {
  if (event.kind === "approval.requested") {
    const approvals = await listStoredApprovals();
    const existing = approvals.find((approval) => approval.id === event.id);
    if (!existing) {
      approvals.unshift({
        id: event.id,
        title: event.title,
        detail: event.message,
        decision: "pending",
        requestedAtMs: event.ts,
        runId: event.runId,
        sessionKey: event.sessionKey,
        agentId: event.agentId,
      });
      await writeJsonFile(APPROVALS_FILE, approvals);
    }
    await markTasksWaitingForApproval(event.runId);
    return;
  }

  if (event.kind === "approval.resolved") {
    const approvals = await listStoredApprovals();
    const decision = event.message.includes("allow-always")
      ? "allow-always"
      : event.message.includes("allow-once")
        ? "allow-once"
        : "deny";
    const nextApprovals = approvals.map((approval) =>
      approval.id === event.id
        ? {
            ...approval,
            decision,
          }
        : approval,
    );
    await writeJsonFile(APPROVALS_FILE, nextApprovals);
    if (decision !== "deny") {
      await clearTaskApprovalFlag(event.runId);
    }
    return;
  }

  if (!event.runId) {
    return;
  }

  const tasks = await listStoredTasks();
  const nextStatus =
    event.kind === "chat.final"
      ? "done"
      : event.kind === "chat.error"
        ? "blocked"
        : event.kind === "chat.aborted"
          ? "waiting"
          : event.kind === "agent.lifecycle"
            ? "doing"
            : null;

  if (!nextStatus) {
    return;
  }

  const nextTasks = tasks.map((task) => {
    if (task.runId !== event.runId) {
      return task;
    }
    const now = Date.now();
    if (nextStatus === "done") {
      return {
        ...task,
        status: "done",
        updatedAtMs: now,
        completed: Array.from(new Set([...task.completed, "Primary run completed"])),
        nextStep: "Review deliverable in Nova chat.",
        lastEvent: event.message,
      };
    }
    if (nextStatus === "blocked") {
      return {
        ...task,
        status: "blocked",
        updatedAtMs: now,
        blockers: Array.from(new Set([...task.blockers, event.message])),
        nextStep: "Resolve the blocker or adjust the brief.",
        lastEvent: event.message,
      };
    }
    if (nextStatus === "waiting") {
      return {
        ...task,
        status: "waiting",
        updatedAtMs: now,
        nextStep: "Waiting for a follow-up decision.",
        lastEvent: event.message,
      };
    }
    return {
      ...task,
      status: "doing",
      updatedAtMs: now,
      lastEvent: event.message,
    };
  });

  await writeJsonFile(TASKS_FILE, nextTasks);
}

async function markTasksWaitingForApproval(runId?: string) {
  if (!runId) {
    return;
  }
  const tasks = await listStoredTasks();
  const nextTasks = tasks.map((task) =>
    task.runId === runId
      ? {
          ...task,
          status: "waiting" as const,
          needsApproval: true,
          updatedAtMs: Date.now(),
          nextStep: "Waiting for your approval in Mission Control.",
        }
      : task,
  );
  await writeJsonFile(TASKS_FILE, nextTasks);
}

async function clearTaskApprovalFlag(runId?: string) {
  if (!runId) {
    return;
  }
  const tasks = await listStoredTasks();
  const nextTasks = tasks.map((task) =>
    task.runId === runId
      ? {
          ...task,
          needsApproval: false,
          status: task.status === "waiting" ? ("doing" as const) : task.status,
          updatedAtMs: Date.now(),
          nextStep:
            task.status === "waiting" ? "Approval granted. Waiting for the run to continue." : task.nextStep,
        }
      : task,
  );
  await writeJsonFile(TASKS_FILE, nextTasks);
}

