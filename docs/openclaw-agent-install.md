# NDB Install and Hosting Guide

This guide is for the OpenClaw agent or operator who will install and host NDB on the VPS.

## Goal

Install and host `NDB` (Nova Dashboard) on the same VPS as OpenClaw, keep it reachable through the existing Tailgate/Tailscale path, and prepare the proposed OpenClaw multi-agent office upgrade without blindly overwriting the current config.

## What has already been verified

Local verification completed on March 6, 2026:

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm run start`
- `GET /`
- `GET /api/dashboard`

The app serves correctly in demo mode when the OpenClaw gateway is not configured, and is ready to switch to live mode once the gateway URL and credentials are provided.

## Recommended production layout

Use these paths unless you already have a better standard:

- Repo checkout: `/opt/ndb`
- Runtime data: `/var/lib/ndb`
- Env file: `/etc/ndb/ndb.env`
- Port: `3010`
- Bind address: `127.0.0.1`
- Service user: `ndb`

## Node runtime

Recommended: Node 24 LTS.

Minimum supported by this repo: Node 22+.

The repo includes `.nvmrc` with `24`.

## 1. Clone the repo

If the repo has already been created on GitHub:

```bash
sudo useradd --system --create-home --home-dir /var/lib/ndb --shell /usr/sbin/nologin ndb || true
sudo git clone <REPLACE_WITH_GITHUB_URL> /opt/ndb
cd /opt/ndb
sudo chown -R ndb:ndb /opt/ndb
```

## 2. Install dependencies

```bash
npm ci
```

If `npm ci` fails because there is no lockfile sync, use:

```bash
npm install
```

## 3. Create the environment file

Create `/etc/ndb/ndb.env` from [`deploy/ndb.env.example`](../deploy/ndb.env.example) and set:

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`
- `MISSION_CONTROL_DATA_DIR=/var/lib/ndb`
- `PORT=3010`

Example:

```bash
sudo mkdir -p /etc/ndb
sudo cp deploy/ndb.env.example /etc/ndb/ndb.env
sudo nano /etc/ndb/ndb.env
sudo mkdir -p /var/lib/ndb
sudo chown -R ndb:ndb /var/lib/ndb
```

## 4. Build the app

```bash
cd /opt/ndb
npm run typecheck
npm run build
```

Expected result:

- typecheck passes
- build passes
- warnings about dynamic file matching are acceptable for now and are not build blockers

## 5. Smoke-test before service install

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
- `mode` is `live` if the gateway credentials work
- `mode` is `demo` if the gateway is still not configured

## 6. Install the systemd service

Copy [`deploy/systemd/ndb.service`](../deploy/systemd/ndb.service) to `/etc/systemd/system/ndb.service`.

Then:

```bash
sudo cp deploy/systemd/ndb.service /etc/systemd/system/ndb.service
sudo systemctl daemon-reload
sudo systemctl enable --now ndb
sudo systemctl status ndb
```

## 7. Verify the running service

```bash
curl -I http://127.0.0.1:3010/
curl http://127.0.0.1:3010/api/dashboard
bash deploy/scripts/smoke-check.sh
```

Useful logs:

```bash
sudo journalctl -u ndb -f
```

## 8. Tailgate / Tailscale exposure

Recommended:

- keep NDB bound to `127.0.0.1`
- expose it through the existing private access layer you already use for OpenClaw

If you already have a reverse proxy or Tailgate/Tailscale Serve path, point it at:

- upstream: `http://127.0.0.1:3010`

Optional Nginx example:

- [`deploy/nginx/ndb.conf`](../deploy/nginx/ndb.conf)

## 9. OpenClaw office upgrade

Do not apply the office patch blindly.

The proposal files are:

- [`openclaw/agent-pack/README.md`](../openclaw/agent-pack/README.md)
- [`openclaw/agent-pack/openclaw-office.patch.json5`](../openclaw/agent-pack/openclaw-office.patch.json5)

Before any OpenClaw config change:

1. Review the current live config.
2. Preserve all existing agents, bindings, channels, hooks, and model refs.
3. Replace the placeholder workspace path in the proposal with `/opt/ndb/openclaw/agent-pack/workspaces/...`
4. Replace `ollama/qwen3.5:4b` if the actual working local model ref on the VPS is named differently.

## Important config warning

OpenClaw `config.patch` uses merge semantics where arrays replace.

That means:

- `agents.list` can be overwritten if patched carelessly
- `bindings` can be overwritten if patched carelessly

So:

- do not call `config.patch` with the proposal file directly
- merge the proposal into a reviewed full config first
- then apply the merged full config with `config.apply` or equivalent reviewed tooling

## Recommended OpenClaw merge procedure

1. Export current config and keep a backup.
2. Copy NDB's `openclaw/agent-pack/workspaces/` to `/opt/ndb/openclaw/agent-pack/workspaces/`.
3. Manually merge only the intended office additions into the current OpenClaw config.
4. Keep current bindings unchanged on the first pass.
5. Add the office agents without forcing Nova to be the default external entry yet.
6. Validate each office agent exists and can open a session.
7. Only after validation, decide whether to route default human entry through `nova`.

## Minimum expected OpenClaw changes

- Add `nova`, `conductor`, `research`, `builder`, `reviewer`, `writer`, `automation`, and `ops` to `agents.list`
- Point each agent workspace to `/opt/ndb/openclaw/agent-pack/workspaces/<agent-id>`
- Enable controlled cross-agent session work
- Keep external-effect actions approval-gated
- Use heartbeats only for `conductor`, `automation`, and `ops`
- Keep heartbeat delivery internal only

## Validation after OpenClaw changes

The office upgrade is ready only when all of these are true:

- `agent:nova:main` exists and responds
- dashboard `/api/dashboard` shows `mode: live`
- dashboard lists the office agents
- approvals can be surfaced in the dashboard
- office feed updates when OpenClaw emits events
- Nova chat in the dashboard reaches the intended session

## Quick rollback

If deployment fails:

1. Stop the `ndb` service
2. revert to the previous OpenClaw config backup
3. keep the repo checkout in place for debugging

## Files to use

- service: [`deploy/systemd/ndb.service`](../deploy/systemd/ndb.service)
- env template: [`deploy/ndb.env.example`](../deploy/ndb.env.example)
- nginx example: [`deploy/nginx/ndb.conf`](../deploy/nginx/ndb.conf)
- smoke test: [`deploy/scripts/smoke-check.sh`](../deploy/scripts/smoke-check.sh)
