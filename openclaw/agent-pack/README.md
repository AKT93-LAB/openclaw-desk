# OpenClaw Office Pack

This folder is a proposal pack for your OpenClaw setup.

It is designed for the workflow you described:

- You speak only to Nova.
- Nova is the human-friendly front desk.
- Conductor runs the office and manages work.
- Specialist agents handle research, building, review, writing, automation, and ops.
- The dashboard mirrors the office in real time.

## Important

Do not apply this blindly.

Your current OpenClaw config already exists, and some config paths can replace arrays if patched carelessly.
Use this pack as a reviewed upgrade plan with your OpenClaw agent.

## Why this office design

This pack is deliberately built around cross-agent session messaging, not deep nested spawn chains.

Why:

- OpenClaw supports multi-agent routing cleanly.
- Spawned subagents are a weaker fit for a durable "office" because they are more transient.
- Conductor needs stable specialist lanes, not brittle sub-sub-agent trees.
- The dashboard can mirror stable agents and sessions much more reliably.

## Agent layout

| Agent | Job | Model lane | Heartbeat |
| --- | --- | --- | --- |
| `nova` | Human-facing front desk | `openai/gpt-5.2` | Off |
| `conductor` | Project manager and routing brain | `openai/gpt-5.2` | Every 20 minutes |
| `research` | Evidence and discovery | `openai/gpt-5.2` | Off |
| `builder` | Implementation and execution | `openai/gpt-5.2` | Off |
| `reviewer` | Quality gate and risk audit | `openai/gpt-5.2` | Off |
| `writer` | Clear user-facing deliverables | `openai/gpt-5.2` | Off |
| `automation` | Recurring work and cron design | local Qwen first, GPT fallback | Every 30 minutes |
| `ops` | Runtime health and drift control | local Qwen first, GPT fallback | Every 15 minutes |

## Model routing note

This pack uses `ollama/qwen3.5:4b` as the local light model example because that is the model you told me you have.

If your actual working OpenClaw model ref is different, replace it with the exact ref that already works in your gateway before applying anything.

## Safe rollout order

1. Copy these workspaces to a stable path on the VPS.
2. Review your current `agents.list`, `bindings`, and `tools` config with your OpenClaw agent.
3. Add the new agents without changing your current default agent yet.
4. Verify that `agent:nova:main` works and that Conductor can coordinate specialists.
5. Only after testing, promote Nova to the default human-facing agent if you want that behavior outside this dashboard too.

## Recommended config conversations

Ask your OpenClaw agent to help you do these things in order:

1. Add the eight office agents using the workspaces in this pack.
2. Keep external channels and current bindings unchanged until Nova is verified.
3. Enable cross-agent session work so Conductor can coordinate specialists.
4. Keep external-effect actions gated by approval.
5. Use heartbeats only for Conductor, Automation, and Ops.
6. Keep heartbeats internal only with `directPolicy: "block"` and `target: "none"`.
7. Use the exact working Ollama model ref already present on your VPS.

## Files in this pack

- `openclaw-office.patch.json5`
  - A proposal config fragment showing the intended office structure.
- `workspaces/<agent-id>/`
  - One workspace per agent.
  - Each workspace includes `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `HEARTBEAT.md`, and `MEMORY.md`.

## What the dashboard expects

The ClawDesk app is built to prefer the `nova` agent session when it exists.

That means once `nova` is configured in OpenClaw, the dashboard will naturally route your chat to Nova instead of the generic main agent.

## Suggested validation checklist

- Nova answers clearly and does not expose technical clutter by default.
- Conductor owns plan, blockers, and delegation.
- Specialists stay inside their lane and ask back when missing information.
- Internal office chatter is visible in the dashboard.
- No agent sends external messages directly.
- Automation drafts stay review-first.
- Ops heartbeats stay quiet when nothing needs attention.
