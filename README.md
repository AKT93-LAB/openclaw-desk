# Nova Mission Control

Chat-first mission control for an OpenClaw deployment.

## What this project does

- Gives Nova a human-readable front desk.
- Mirrors OpenClaw activity into a clearer office-style dashboard.
- Tracks tasks, approvals, automations, sessions, and agent activity.
- Generates a proposed multi-agent office pack for OpenClaw instead of editing your live VPS config blindly.

## Local requirements

- Node 22+
- An OpenClaw gateway reachable from this app

## Environment

Copy `.env.example` to `.env.local` and set:

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- The dashboard is designed to run on the same VPS or PC as OpenClaw.
- It uses a server-side WebSocket bridge to OpenClaw so the browser never needs direct gateway credentials.
- The `openclaw/agent-pack/` folder contains the proposed enterprise office setup for Nova, Conductor, and the specialist agents.
- When a `nova` agent exists in OpenClaw, Mission Control will prefer `agent:nova:main` as the chat entry point.

## Deploy on your VPS

Typical flow:

1. Copy this app to the same machine that runs OpenClaw.
2. Set `.env.local` with the OpenClaw gateway URL and credentials.
3. Install Node 22+.
4. Run `npm install`.
5. Run `npm run build`.
6. Start with `npm run start` behind your preferred reverse proxy or Tailgate-accessible port.

## Office pack

Review [openclaw/agent-pack/README.md](openclaw/agent-pack/README.md) before discussing changes with your OpenClaw agent.

## Operator docs

- Install and hosting guide: [docs/openclaw-agent-install.md](docs/openclaw-agent-install.md)
- OpenClaw config merge guide: [docs/openclaw-agent-config-merge.md](docs/openclaw-agent-config-merge.md)
