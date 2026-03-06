# OpenClaw Config Merge Guide for ClawDesk

This guide covers the safe way to merge the proposed ClawDesk office setup into an existing OpenClaw install.

## Critical rule

Do **not** send [openclaw-office.patch.json5](../openclaw/agent-pack/openclaw-office.patch.json5) directly to `config.patch`.

Why:

- `agents.list` is an array
- `bindings` is an array
- merge-patch semantics replace arrays

A careless patch can wipe unrelated working configuration.

## What ClawDesk needs from OpenClaw

ClawDesk does not need a total OpenClaw redesign.

It needs:

- a reachable gateway
- a usable `nova` agent
- real `agents.list` data
- real session activity
- readable config snapshots
- workspace paths that resolve on the local host

## Config areas to preserve

These should be preserved exactly unless there is a deliberate reason to change them:

- `channels`
- `bindings`
- `hooks`
- `models`
- existing approval posture
- any production safety controls already in place

## Proposed office agents

- `nova`
- `conductor`
- `research`
- `builder`
- `reviewer`
- `writer`
- `automation`
- `ops`

## Required customization before applying anything

The proposal pack contains placeholders that must be aligned with the real host:

- workspace paths
- agent directories if your deployment uses non-default locations
- the actual local Ollama model ref
- any stricter sandbox posture already required in production

Example:

- the repo proposal may reference `ollama/qwen3.5:4b`
- if the live OpenClaw model registry uses a different id, replace it with the exact working id

## Safe merge process

### Step 1. Export the current live config

Save a backup before editing anything.

### Step 2. Review the current shape

Confirm:

- whether `agents.list` already contains `nova` or overlapping agent ids
- whether `agents.defaults` carries important inherited values
- whether `bindings` would be affected by any routing change
- whether the current default human-facing agent should remain unchanged during the first pass

### Step 3. Stage the office workspaces

The workspace directories in [openclaw/agent-pack/workspaces](../openclaw/agent-pack/workspaces) should exist on the live host before agent activation.

Recommended live location:

- `/opt/clawdesk/openclaw/agent-pack/workspaces/<agent-id>`

### Step 4. Build a merged candidate config

The merged candidate should:

- keep all current working config intact
- append the office agents carefully to `agents.list`
- point each office agent to a real workspace path
- keep existing bindings unchanged on the first pass
- keep external-effect actions approval-gated

### Step 5. Validate the merged candidate before apply

Check:

- all referenced workspaces exist
- all referenced models exist
- there are no duplicate agent ids
- no current production agent was removed accidentally

### Step 6. Apply in one reviewed step

Apply the reviewed merged candidate using the OpenClaw process you trust for full reviewed config updates.

## Recommended first-pass policy

For the first rollout:

- add the office agents
- do not replace the existing external default entry immediately
- verify Nova and Conductor in isolation first

Then:

- confirm `agent:nova:main` responds correctly
- confirm Conductor can coordinate specialists
- only then decide whether to promote Nova more broadly in your OpenClaw routing

## Heartbeat policy

Only these should heartbeat in the first pass:

- `conductor`
- `automation`
- `ops`

Keep heartbeat delivery internal only.

Recommended posture:

- `directPolicy: "block"`
- `target: "none"`

## Approval posture

For this project, keep approvals on any externally affecting action.

Examples:

- email send
- social posting
- other outbound communication or external mutation

Do not relax those gates during the initial rollout.

## Validation checklist after merge

The merge is acceptable only if all of these pass:

- `agents.list` includes the office agents
- each office workspace exists on disk
- `agent:nova:main` can open a live session
- ClawDesk shows the real office agents
- Nova chat works from ClawDesk
- office events appear in ClawDesk
- approvals still function
- no existing OpenClaw behavior regressed

## Rollback

If the merge causes regressions:

1. restore the previous full config backup
2. restart or reload OpenClaw as required by your environment
3. keep the workspace files but do not route production traffic through the office agents

## Related docs

- [README.md](../README.md)
- [docs/openclaw-agent-install.md](./openclaw-agent-install.md)
- [docs/openclaw-integration-contract.md](./openclaw-integration-contract.md)
- [openclaw/agent-pack/README.md](../openclaw/agent-pack/README.md)
