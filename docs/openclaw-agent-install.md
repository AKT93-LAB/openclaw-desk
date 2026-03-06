# NDB Install and Hosting Guide

This guide is written for the OpenClaw agent or operator who will install NDB on the same VPS or PC as OpenClaw.

## Outcome

At the end of this runbook, all of these should be true:

- NDB is installed under `/opt/ndb`
- NDB runs as a long-lived service on `127.0.0.1:3010`
- NDB can reach the live OpenClaw gateway
- `GET /api/dashboard` returns `mode: "live"`
- the dashboard shows real agents, sessions, approvals, automations, and config
- the proposed office pack has been reviewed for merge, not blindly applied

## Prerequisites

- NDB and OpenClaw run on the same host
- Node 22+ is installed
- the OpenClaw gateway is reachable locally
- a working OpenClaw gateway credential is available
- the operator can review and merge OpenClaw config safely

Recommended:

- Node 24 LTS
- a dedicated service user such as `ndb`
- private access through Tailgate / Tailscale / reverse proxy

## Verified app state before VPS install

This repo has already been verified locally on March 6, 2026:

- `npm install`
- `npm run typecheck`
- `npm run build`
- production start
- `GET /`
- `GET /api/dashboard`
- Playwright verification of shell and mobile drawers

What is **not** yet proved from this repo alone:

- your real gateway URL and credential
- your real OpenClaw agent list
- your real workspace paths
- your real approvals flow

That proof happens on the target host during the live validation steps below.

## Recommended production layout

- repo checkout: `/opt/ndb`
- env file: `/etc/ndb/ndb.env`
- runtime data: `/var/lib/ndb`
- service user: `ndb`
- host bind: `127.0.0.1`
- port: `3010`

## 1. Clone the repo

```bash
sudo useradd --system --create-home --home-dir /var/lib/ndb --shell /usr/sbin/nologin ndb || true
sudo git clone <REPLACE_WITH_GITHUB_URL> /opt/ndb
sudo chown -R ndb:ndb /opt/ndb
cd /opt/ndb
```

If the repo is already present:

```bash
cd /opt/ndb
git pull --ff-only
```

## 2. Install dependencies

```bash
cd /opt/ndb
npm ci
```

If `npm ci` fails because the lockfile is out of sync:

```bash
npm install
```

## 3. Create the environment file

Use [deploy/ndb.env.example](../deploy/ndb.env.example) as the template.

Required values:

- `OPENCLAW_GATEWAY_URL`
- either `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`
- `MISSION_CONTROL_DATA_DIR=/var/lib/ndb`
- `PORT=3010`

Example:

```bash
sudo mkdir -p /etc/ndb /var/lib/ndb
sudo cp deploy/ndb.env.example /etc/ndb/ndb.env
sudo chown -R ndb:ndb /var/lib/ndb
sudo nano /etc/ndb/ndb.env
```

Example env:

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<token>
MISSION_CONTROL_DATA_DIR=/var/lib/ndb
PORT=3010
```

## 4. Build and verify the app

```bash
cd /opt/ndb
npm run typecheck
npm run build
```

Expected:

- typecheck passes
- build passes

## 5. Smoke-test before installing the service

Load env values and start NDB:

```bash
cd /opt/ndb
set -a
source /etc/ndb/ndb.env
set +a
npm run start -- --hostname 127.0.0.1 --port 3010
```

In another shell:

```bash
curl -I http://127.0.0.1:3010/
curl http://127.0.0.1:3010/api/dashboard
```

Expected:

- `/` returns `200 OK`
- `/api/dashboard` returns JSON

Interpret the result correctly:

- `mode: "offline"` means NDB is working but not yet connected to OpenClaw
- `mode: "live"` means the gateway connection is working

NDB must **not** fabricate a fake office state when offline.

## 6. Install the systemd service

Use [deploy/systemd/ndb.service](../deploy/systemd/ndb.service).

```bash
sudo cp deploy/systemd/ndb.service /etc/systemd/system/ndb.service
sudo systemctl daemon-reload
sudo systemctl enable --now ndb
sudo systemctl status ndb
```

If `npm` is not located at `/usr/bin/npm` on that host, adjust `ExecStart` in the service file before enabling it.

## 7. Verify the running service

```bash
curl -I http://127.0.0.1:3010/
curl http://127.0.0.1:3010/api/dashboard
bash deploy/scripts/smoke-check.sh
```

Logs:

```bash
sudo journalctl -u ndb -f
```

## 8. Expose NDB through private access only

Recommended:

- keep NDB bound to `127.0.0.1`
- expose it only through the existing private access layer

Optional Nginx example:

- [deploy/nginx/ndb.conf](../deploy/nginx/ndb.conf)

If you already use Tailgate / Tailscale Serve / reverse proxy, point it at:

- upstream `http://127.0.0.1:3010`

## 9. Connect NDB to the real OpenClaw host state

NDB depends on the live gateway and live local files.

You must confirm that the following all work on the target host:

- gateway connection succeeds
- `agents.list` returns the real agent inventory
- `sessions.list` returns active sessions
- `cron.list` returns actual jobs
- `channels.status` returns actual channel status
- `config.get` returns the live config snapshot
- `chat.history` returns the current transcript for Nova

If any of those do not work, stop there and fix the OpenClaw side first.

## 10. Review the office pack before changing OpenClaw

Read:

- [openclaw/agent-pack/README.md](../openclaw/agent-pack/README.md)
- [openclaw/agent-pack/openclaw-office.patch.json5](../openclaw/agent-pack/openclaw-office.patch.json5)
- [docs/openclaw-agent-config-merge.md](./openclaw-agent-config-merge.md)
- [docs/openclaw-integration-contract.md](./openclaw-integration-contract.md)

Do **not** call `config.patch` with the office patch file directly.

## 11. Stage the office workspaces

Copy the proposed workspaces into a stable location on the same host:

```bash
cd /opt/ndb
ls openclaw/agent-pack/workspaces
```

Recommended live path:

- `/opt/ndb/openclaw/agent-pack/workspaces/<agent-id>`

These paths must match whatever is placed in the reviewed OpenClaw config.

## 12. Merge OpenClaw config safely

Before any config change:

1. export the current OpenClaw config and back it up
2. preserve current channels, bindings, hooks, and models
3. merge the office agents into `agents.list` carefully
4. customize workspace paths
5. customize the actual local Ollama model ref if it differs from `ollama/qwen3.5:4b`
6. keep external-effect actions approval-gated

## 13. Validate the office setup live

NDB is considered ready only when all of these are true:

- `agent:nova:main` exists and responds
- the dashboard shows `mode: "live"`
- the dashboard lists the real agents from OpenClaw
- Nova chat works from the dashboard
- approvals appear in the dashboard when triggered
- office events appear in the right inspector
- agent config edits succeed through the dashboard
- workspace file edits succeed through the dashboard

## 14. Use the UI proof set

Current verified UI captures are in:

- [docs/ui-gallery.html](./ui-gallery.html)
- [docs/ndb-presentation.html](./ndb-presentation.html)

These are useful for confirming the intended shell behavior before the live gateway is connected.

## 15. Rollback

If any live validation fails:

1. stop the `ndb` service
2. restore the previous OpenClaw config backup
3. keep the NDB checkout for debugging

## Files in this repo that matter most during install

- [README.md](../README.md)
- [deploy/ndb.env.example](../deploy/ndb.env.example)
- [deploy/systemd/ndb.service](../deploy/systemd/ndb.service)
- [deploy/nginx/ndb.conf](../deploy/nginx/ndb.conf)
- [deploy/scripts/smoke-check.sh](../deploy/scripts/smoke-check.sh)
- [docs/openclaw-agent-config-merge.md](./openclaw-agent-config-merge.md)
- [docs/openclaw-integration-contract.md](./openclaw-integration-contract.md)
