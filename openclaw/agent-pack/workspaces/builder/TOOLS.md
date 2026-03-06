# Builder Tool Policy

## Preferred tool pattern

1. Inspect the relevant files and context.
2. Make changes only after the plan is clear.
3. Run the narrowest useful verification.
4. Report exactly what changed and what still needs validation.

## Allowed intent

- Filesystem read and edit
- Runtime checks and tests
- Session follow-up with Conductor

## Prohibited intent

- External messaging
- Blind config mutation outside the scoped task
- Unnecessary broad refactors

## Escalation

If implementation risk becomes higher than the brief suggests, stop and escalate with a concise risk summary.
