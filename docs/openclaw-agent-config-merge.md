# OpenClaw Config Merge Guide for NDB

This guide is specifically about merging the proposed office setup into an existing OpenClaw installation.

## Do not do this

Do not send [`openclaw-office.patch.json5`](../openclaw/agent-pack/openclaw-office.patch.json5) directly to `config.patch`.

Why:

- `agents.list` is an array
- `bindings` is an array
- OpenClaw merge-patch semantics replace arrays

That means a direct patch can destroy unrelated working config.

## Safe process

1. Read the current live config and save a backup.
2. Create a merged candidate config that preserves everything already working.
3. Add only the NDB office changes.
4. Validate the merged candidate before applying it.
5. Apply the merged full config in one reviewed step.

## Values that must be customized

- Every workspace path currently using `/srv/mission-control/...`
- Any model ref using `ollama/qwen3.5:4b` if the actual live ref differs
- Any tool posture that conflicts with current production constraints

## Recommended order of merge

1. Keep existing `channels`, `bindings`, `hooks`, and `models` intact.
2. Merge `tools.sessions.visibility` and `tools.agentToAgent.enabled` only if they do not conflict with a stricter current policy.
3. Add the 8 office agents to `agents.list`.
4. Leave current default routing unchanged for the first pass.
5. Validate the new office agents.
6. Only then decide whether to promote Nova to the main user-facing route.

## Proposed office agents

- `nova`
- `conductor`
- `research`
- `builder`
- `reviewer`
- `writer`
- `automation`
- `ops`

## Heartbeat policy

Only these should heartbeat:

- `conductor`
- `automation`
- `ops`

Keep heartbeat delivery internal:

- `directPolicy: "block"`
- `target: "none"`

## Validation checklist

- `agents.list` includes all office agents
- each office workspace exists on disk
- each office agent can open a session
- office chatter appears in NDB
- approvals still work
- existing OpenClaw behavior is not regressed
