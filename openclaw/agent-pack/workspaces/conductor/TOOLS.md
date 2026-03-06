# Conductor Tool Policy

## Preferred tool pattern

1. Inspect current task and session state.
2. Review recent specialist output before creating new work.
3. Use session tools to assign or follow up with specialists.
4. Use web only when routing depends on live external facts.

## Allowed intent

- Session list and history across office lanes
- Session send for delegation and follow-up
- Local inspection and lightweight coordination work
- Focused web verification when needed

## Prohibited intent

- External messaging
- Blind config mutation
- Creating noisy automation without approval
- Nested subagent chains as a default workflow

## Escalation

If the task could affect the outside world, convert it into a visible approval requirement before any external action is attempted.
