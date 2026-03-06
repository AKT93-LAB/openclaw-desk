# NDB (Nova Dashboard)

Chat-first mission control for OpenClaw.

NDB is a separate app that runs beside OpenClaw and gives a non-technical operator a human-readable control room for:

- talking to `nova` as the default front desk
- watching live OpenClaw sessions and office activity
- handling approvals
- editing agent config from forms instead of raw config files
- editing key agent workspace files from the dashboard
- reviewing real cron jobs and config summaries

This repo also ships a proposed multi-agent office pack for OpenClaw:

- `nova`
- `conductor`
- `research`
- `builder`
- `reviewer`
- `writer`
- `automation`
- `ops`

## Current status

The app itself is build-verified and browser-verified.

Verified locally on March 6, 2026:

- `npm install`
- `npm run typecheck`
- `npm run build`
- production start on `127.0.0.1:3010`
- `GET /`
- `GET /api/dashboard`
- Playwright verification of the real shell and mobile drawers

Important boundary:

- NDB does **not** invent fake agents, tasks, approvals, or office chatter
- if OpenClaw is not connected, the dashboard stays in `offline` mode and shows an honest empty state
- live Nova chat, live agent lists, approvals, config editing, and workspace editing only become meaningful when NDB is connected to a real OpenClaw gateway on the same host

## What NDB is

NDB is not a static frontend only.

It is:

- a Next.js web UI
- a local host-side service that talks to OpenClaw over the gateway
- a local filesystem bridge for agent workspace file editing

That architecture is required because a browser alone cannot safely:

- hold gateway credentials
- read local OpenClaw workspaces
- write local agent files
- mirror host-side runtime state safely

## Core principles

### 1. Zero mock policy

The dashboard must never fabricate office activity just to make the screen look busy.

### 2. Human-first UI

The operator should not need to edit OpenClaw config files directly for normal administration.

### 3. Review-first writeback

NDB writes only through real control surfaces:

- OpenClaw `config.patch` for agent config edits
- local file writes for approved agent workspace files

### 4. Same-host deployment

To support live file editing safely, NDB should run on the same VPS or PC as OpenClaw.

## What is implemented in this repo

### Dashboard UI

- chat-first shell
- desktop shell with left navigation, main workspace, and right inspector
- mobile drawers for `Menu` and `Inspector`
- strict offline state when no gateway is configured

### Live integration layer

NDB reads live OpenClaw state from the gateway using:

- `agents.list`
- `sessions.list`
- `cron.list`
- `channels.status`
- `config.get`
- `chat.history`
- gateway event stream over WebSocket

NDB performs live actions using:

- `chat.send`
- `exec.approval.resolve`
- `config.patch`

### Live agent editor

Config edits currently write back these agent fields:

- `name`
- `model`
- `workspace`
- `agentDir`
- `heartbeat.every`
- `sandbox.mode`
- `identity.name`
- `identity.theme`
- `identity.emoji`

Workspace file edits currently support:

- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `HEARTBEAT.md`
- `USER.md`
- `MEMORY.md`

### OpenClaw office pack

This repo includes a reviewed proposal pack under [openclaw/agent-pack](./openclaw/agent-pack) for the Nova office model.

Do **not** apply that patch blindly.

## What still depends on the live OpenClaw host

These cannot be proved end to end from this local repo alone:

- that your real OpenClaw gateway credentials are correct
- that your real `nova` agent exists as expected
- that your current `agents.list` shape matches the assumptions in this repo
- that your real workspace paths resolve exactly as expected on the VPS
- that approvals surface from your actual runtime
- that your real channels and sessions appear exactly as this UI expects

That is why the install flow below includes a live validation pass on the VPS.

## Quick start

### Local development

1. Copy `.env.example` to `.env.local`
2. Set `OPENCLAW_GATEWAY_URL`
3. Set either `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`
4. Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Local production smoke check

```bash
npm install
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3010
```

Then check:

```bash
curl -I http://127.0.0.1:3010/
curl http://127.0.0.1:3010/api/dashboard
```

## Recommended production topology

Run NDB on the same VPS as OpenClaw:

- NDB bind address: `127.0.0.1`
- NDB port: `3010`
- expose it through your existing Tailgate / Tailscale / reverse-proxy path
- keep gateway credentials server-side only

Recommended paths:

- repo checkout: `/opt/ndb`
- runtime data: `/var/lib/ndb`
- env file: `/etc/ndb/ndb.env`

## End-to-end install sequence for an OpenClaw agent

1. Clone this repo onto the same host as OpenClaw.
2. Configure the env file with the real gateway URL and credentials.
3. Install dependencies and build NDB.
4. Start NDB locally and verify `/api/dashboard`.
5. Keep NDB in `offline` mode until the gateway is confirmed.
6. Point NDB at the live OpenClaw gateway.
7. Verify that NDB can read live agents, sessions, cron jobs, channels, and config.
8. Review the office pack proposal with the current OpenClaw config.
9. Merge the office agents safely without replacing unrelated arrays.
10. Validate that `agent:nova:main` works and that the dashboard shows live office activity.
11. Only then expose NDB through the private remote-access path.

## Repo structure

- [app](./app) - Next.js routes and API handlers
- [components](./components) - dashboard UI
- [lib](./lib) - OpenClaw bridge, snapshot builder, config parsing, and types
- [deploy](./deploy) - env template, `systemd`, `nginx`, and smoke check
- [docs](./docs) - operator docs, screenshots, and presentation
- [openclaw/agent-pack](./openclaw/agent-pack) - proposed office setup and workspaces

## Operator docs

- [docs/openclaw-agent-install.md](./docs/openclaw-agent-install.md) - install and hosting runbook
- [docs/openclaw-agent-config-merge.md](./docs/openclaw-agent-config-merge.md) - safe OpenClaw merge procedure
- [docs/openclaw-integration-contract.md](./docs/openclaw-integration-contract.md) - exact integration surfaces NDB depends on
- [docs/ui-gallery.html](./docs/ui-gallery.html) - current verified screenshots
- [docs/ndb-presentation.html](./docs/ndb-presentation.html) - presentation overview for operators and reviewers

## Deployment files

- [deploy/ndb.env.example](./deploy/ndb.env.example)
- [deploy/systemd/ndb.service](./deploy/systemd/ndb.service)
- [deploy/nginx/ndb.conf](./deploy/nginx/ndb.conf)
- [deploy/scripts/smoke-check.sh](./deploy/scripts/smoke-check.sh)

## OpenClaw office pack docs

- [openclaw/agent-pack/README.md](./openclaw/agent-pack/README.md)
- [openclaw/agent-pack/openclaw-office.patch.json5](./openclaw/agent-pack/openclaw-office.patch.json5)

## Safety notes

- Do not send the office patch directly to `config.patch`.
- Do not overwrite `agents.list` or `bindings` arrays by accident.
- Keep external-effect actions approval-gated.
- Run NDB on the same host as OpenClaw if you want live workspace file editing.

## Repository

Public GitHub repo:

- [AKT93-LAB/NDB](https://github.com/AKT93-LAB/NDB)
