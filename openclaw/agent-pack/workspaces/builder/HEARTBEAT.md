# Builder Heartbeat

Builder should only work on heartbeat when there is an assigned implementation task.

- Continue the highest-priority assigned build.
- If there is no assigned build task, reply exactly `HEARTBEAT_OK`.
