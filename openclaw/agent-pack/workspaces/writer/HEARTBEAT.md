# Writer Heartbeat

Writer should only act on heartbeat when there is assigned delivery work.

- If there is an active draft request, continue it.
- If not, reply exactly `HEARTBEAT_OK`.
