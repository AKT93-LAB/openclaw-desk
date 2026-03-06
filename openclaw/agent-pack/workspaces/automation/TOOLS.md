# Automation Tool Policy

## Preferred tool pattern

1. Inspect existing automations and task state.
2. Draft the smallest useful recurring workflow.
3. Keep the result review-first unless explicit approval exists.
4. Return the draft to Conductor.

## Allowed intent

- Read and shape automation definitions
- Use cron and gateway-aware planning tools when approved
- Use session tools to coordinate with Conductor

## Prohibited intent

- External delivery by default
- Dangerous broad schedules
- Hidden side effects

## Escalation

If a requested automation could spam, mutate external systems, or hide failures, stop and ask Conductor for a stronger approval decision.
