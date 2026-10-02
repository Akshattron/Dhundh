# DHUNDH Build Gate Prompt

Read `AGENTS.md`, `.github/copilot-instructions.md`, the applicable path-specific instructions, and `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md`.

Then inspect the repository and determine the highest currently unlocked engineering gate.

For that gate:

1. Implement the specified work only.
2. Run relevant unit/integration tests.
3. Run scenario validation where applicable.
4. Run typecheck/build.
5. Fix failures at root cause.
6. Verify the flagship demo path remains intact.
7. Update `docs/PROGRESS.md`.
8. Report exact files changed and exact validation commands/results.

Do not begin a lower-priority tier until the current gate passes.
