# ClawDesk Install and Hosting Guide

This guide is written for the OpenClaw agent or operator who will install ClawDesk on the same VPS or PC as OpenClaw.

## Outcome

At the end of this runbook, all of these should be true:

- ClawDesk is installed under `/opt/clawdesk`
- ClawDesk runs as a long-lived service on `127.0.0.1:3010`
- ClawDesk can reach the live OpenClaw gateway
- `GET /api/dashboard` returns `mode: "live"`
- the dashboard shows real agents, sessions, approvals, automations, and config
- the proposed office pack has been reviewed for merge, not blindly applied

## Prerequisites

- ClawDesk and OpenClaw run on the same host
- Node 22+ is installed
- the OpenClaw gateway is reachable locally
- a working OpenClaw gateway credential is available
- the operator can review and merge OpenClaw config safely

Recommended:

- Node 24 LTS
- a dedicated service user such as `clawdesk`
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

- repo checkout: `/opt/clawdesk`
- env file: `/etc/clawdesk/clawdesk.env`
- runtime data: `/var/lib/clawdesk`
- service user: `clawdesk`
- host bind: `127.0.0.1`
- port: `3010`

## 1. Clone the repo

```bash
sudo useradd --system --create-home --home-dir /var/lib/clawdesk --shell /usr/sbin/nologin clawdesk || true
sudo git clone https://github.com/AKT93-LAB/openclaw-desk.git /opt/clawdesk
sudo chown -R clawdesk:clawdesk /opt/clawdesk
cd /opt/clawdesk
```

If the repo is already present:

```bash
cd /opt/clawdesk
git pull --ff-only
```

## 2. Install dependencies

```bash
cd /opt/clawdesk
npm ci
```

If `npm ci` fails because the lockfile is out of sync:

```bash
npm install
```

## 3. Create the environment file

Use [deploy/clawdesk.env.example](../deploy/clawdesk.env.example) as the template.

Required values:

- `OPENCLAW_GATEWAY_URL`
- either `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`
- `OPENCLAW_HOME` or `OPENCLAW_IDENTITY_DIR` if ClawDesk should auto-load device identity from a non-default location
- `OPENCLAW_GATEWAY_CLIENT_ID` if you need to override the default `gateway-client`
- `OPENCLAW_GATEWAY_CLIENT_MODE` if you need to override the default `backend`
- `MISSION_CONTROL_DATA_DIR=/var/lib/clawdesk`
- `PORT=3010`

Example:

```bash
sudo mkdir -p /etc/clawdesk /var/lib/clawdesk
sudo cp deploy/clawdesk.env.example /etc/clawdesk/clawdesk.env
sudo chown -R clawdesk:clawdesk /var/lib/clawdesk
sudo nano /etc/clawdesk/clawdesk.env
```

Example env:

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_HOME=~/.openclaw
OPENCLAW_GATEWAY_CLIENT_ID=gateway-client
OPENCLAW_GATEWAY_CLIENT_MODE=backend
MISSION_CONTROL_DATA_DIR=/var/lib/clawdesk
PORT=3010
```

If `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_GATEWAY_PASSWORD` are both empty, ClawDesk will attempt operator auth using the OpenClaw device identity on disk.

## 4. Build and verify the app

```bash
cd /opt/clawdesk
npm run typecheck
npm run build
```

Expected:

- typecheck passes
- build passes

## 5. Smoke-test before installing the service

Load env values and start ClawDesk:

```bash
cd /opt/clawdesk
set -a
source /etc/clawdesk/clawdesk.env
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

- `mode: "offline"` means ClawDesk is working but not yet connected to OpenClaw
- `mode: "live"` means the gateway connection is working

ClawDesk must **not** fabricate a fake office state when offline.

## 6. Install the systemd service

Use [deploy/systemd/clawdesk.service](../deploy/systemd/clawdesk.service).

```bash
sudo cp deploy/systemd/clawdesk.service /etc/systemd/system/clawdesk.service
sudo systemctl daemon-reload
sudo systemctl enable --now clawdesk
sudo systemctl status clawdesk
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
sudo journalctl -u clawdesk -f
```

## 8. Expose ClawDesk through private access only

Recommended:

- keep ClawDesk bound to `127.0.0.1`
- expose it only through the existing private access layer

Optional Nginx example:

- [deploy/nginx/clawdesk.conf](../deploy/nginx/clawdesk.conf)

If you already use Tailgate / Tailscale Serve / reverse proxy, point it at:

- upstream `http://127.0.0.1:3010`

## 9. Connect ClawDesk to the real OpenClaw host state

ClawDesk depends on the live gateway and live local files.

You must confirm that the following all work on the target host:

- gateway connection succeeds
- `sessions.list` returns active sessions
- `cron.list` returns actual jobs
- `channels.status` returns actual channel status
- `config.get` returns the live config snapshot
- `chat.history` returns the current transcript for the gateway-provided main session

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
cd /opt/clawdesk
ls openclaw/agent-pack/workspaces
```

Recommended live path:

- `/opt/clawdesk/openclaw/agent-pack/workspaces/<agent-id>`

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

ClawDesk is considered ready only when all of these are true:

- the gateway returns a valid `mainSessionKey`
- the dashboard shows `mode: "live"`
- the dashboard lists the real agents from OpenClaw
- primary chat works from the dashboard
- approvals appear in the dashboard when triggered
- office events appear in the right inspector
- agent config edits succeed through the dashboard
- workspace file edits succeed through the dashboard

## 14. Use the UI proof set

Current verified UI captures are in:

- [docs/ui-gallery.html](./ui-gallery.html)
- [docs/clawdesk-presentation.html](./clawdesk-presentation.html)

These are useful for confirming the intended shell behavior before the live gateway is connected.

## 15. Rollback

If any live validation fails:

1. stop the `clawdesk` service
2. restore the previous OpenClaw config backup
3. keep the ClawDesk checkout for debugging

## Files in this repo that matter most during install

- [README.md](../README.md)
- [deploy/clawdesk.env.example](../deploy/clawdesk.env.example)
- [deploy/systemd/clawdesk.service](../deploy/systemd/clawdesk.service)
- [deploy/nginx/clawdesk.conf](../deploy/nginx/clawdesk.conf)
- [deploy/scripts/smoke-check.sh](../deploy/scripts/smoke-check.sh)
- [docs/openclaw-agent-config-merge.md](./openclaw-agent-config-merge.md)
- [docs/openclaw-integration-contract.md](./openclaw-integration-contract.md)
