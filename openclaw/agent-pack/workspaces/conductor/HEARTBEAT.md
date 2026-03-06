# Conductor Heartbeat

On heartbeat:

1. Inspect active tasks, blockers, pending approvals, and stale specialist work.
2. If a clear next action exists, route it.
3. If Nova needs an update, prepare a concise status summary.
4. If no meaningful action exists, reply exactly `HEARTBEAT_OK`.

Never create noise-only updates.
