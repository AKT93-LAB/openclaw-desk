# OpenClaw Integration Contract for ClawDesk

This document defines the exact OpenClaw surfaces ClawDesk expects to use.

It is the most important reference for an OpenClaw agent who needs to make ClawDesk work end to end.

## Deployment contract

ClawDesk should run on the same host as OpenClaw when live agent workspace editing is required.

Why:

- ClawDesk writes selected agent workspace files directly on disk
- the browser must not hold gateway credentials
- path discovery and local file access are host-side concerns

## Gateway contract

ClawDesk expects a reachable OpenClaw gateway URL in:

- `OPENCLAW_GATEWAY_URL`

Authentication can use either:

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_PASSWORD`

If the gateway is unreachable or not configured:

- ClawDesk returns `mode: "offline"`
- the dashboard remains empty instead of fabricating data

## Read operations ClawDesk depends on

ClawDesk currently reads live state through these gateway methods:

- `agents.list`
- `sessions.list`
- `cron.list`
- `channels.status`
- `config.get`
- `chat.history`

ClawDesk also listens to gateway events over WebSocket and exposes them to the browser as server-sent events from `/api/events`.

## Write operations ClawDesk depends on

ClawDesk currently performs live actions through these gateway methods:

- `chat.send`
- `exec.approval.resolve`
- `config.patch`

## Config contract

ClawDesk uses `config.get` to discover live agent configuration and `config.patch` to update specific agent fields.

ClawDesk currently edits these config fields:

- `name`
- `model`
- `workspace`
- `agentDir`
- `heartbeat.every`
- `sandbox.mode`
- `identity.name`
- `identity.theme`
- `identity.emoji`

ClawDesk assumes:

- `config.get` can provide a raw or parsed config snapshot
- `config.get` can provide a config hash if OpenClaw requires optimistic concurrency

## Agent discovery contract

ClawDesk derives the visible live team from:

- `agents.list`
- the current `config.agents.list`

That means:

- live agents can appear from the runtime
- configured but not currently live agents can still appear from config

## Session contract

ClawDesk expects session keys to be available from `sessions.list`.

When possible, ClawDesk infers the owning agent from session keys shaped like:

- `agent:<agent-id>:...`

If your OpenClaw runtime uses a materially different session key convention, the session-to-agent mapping may need adaptation.

## Nova contract

The dashboard is chat-first and prefers a live `nova` agent.

Operational expectation:

- `nova` exists in OpenClaw
- a main Nova session can be opened and used for human entry

If `nova` is absent:

- the Nova composer stays disabled
- ClawDesk does not silently reroute to a fake or invented fallback

## Workspace file contract

ClawDesk currently exposes dashboard editing for these files inside each live agent workspace:

- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `HEARTBEAT.md`
- `USER.md`
- `MEMORY.md`

ClawDesk resolves workspace paths from live config first.

If a workspace path begins with `~`, ClawDesk expands it to the local host home directory before reading or writing files.

## File safety contract

ClawDesk only allows writes to the approved agent file list above.

ClawDesk rejects arbitrary path writes outside the resolved workspace root.

## Config merge warning

OpenClaw config changes are the main risk area.

Why:

- `agents.list` is an array
- `bindings` is an array
- merge patch can replace arrays

Therefore:

- do not feed the office patch directly into `config.patch`
- build and review a merged full config candidate first

## Approval contract

The intended operator policy for this project is:

- any externally affecting action should require approval

ClawDesk can surface and resolve approvals, but the approval posture itself still depends on the OpenClaw configuration and runtime behavior.

## Runtime expectations for a successful deployment

ClawDesk is working end to end only if all of these are true:

- the gateway connection is live
- `GET /api/dashboard` returns `mode: "live"`
- real agents appear
- real sessions appear
- real cron jobs appear
- config summary is populated from the live config
- Nova chat works
- approvals round-trip
- agent config changes round-trip
- agent workspace file changes round-trip

## What ClawDesk does not assume

ClawDesk does not assume:

- one exact OpenClaw folder layout for every machine
- hardcoded workspace paths for every install
- that a fake fallback state is acceptable

ClawDesk prefers discovery from live config and runtime state wherever possible.

## When an OpenClaw agent should stop and escalate

Stop and review before proceeding if:

- the live OpenClaw config shape differs materially from the assumptions above
- session keys do not identify agents in a compatible way
- `config.patch` semantics differ from expected merge behavior
- workspace paths resolve outside the intended local directories
- the real `nova` routing model conflicts with current production behavior

## Related docs

- [README.md](../README.md)
- [docs/openclaw-agent-install.md](./openclaw-agent-install.md)
- [docs/openclaw-agent-config-merge.md](./openclaw-agent-config-merge.md)
