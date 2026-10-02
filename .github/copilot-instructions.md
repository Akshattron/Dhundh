# DHUNDH — GitHub Copilot Repository Instructions

## Source of truth

The implementation contract is [`COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md`](../COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md). Read and follow it before substantive implementation work.

## Product

DHUNDH is the SIH 2026 PS 26248 prototype: a deterministic web-based training simulator for decision-making under degraded information. The defining product idea is information-conditioned decision evaluation: evaluate a decision using the belief/information state available at the decision timestamp, then separately reveal outcome and reconstruct the session through AAR.

## Architecture

Follow the locked stack and file structure in the master specification. Do not substitute libraries or redesign the architecture unless a documented compatibility blocker is demonstrated.

## Engineering rules

- Decisions, not options.
- Default order: P0 → P1 → Demo → P2 → selected P3. Only dependency-independent P3 may start after Gate 4 under master Section 58.7; network-dependent P3 waits for Gate 5. P2 acceptance and multiplayer priority remain binding.
- P0 implements its exact mathematical/scoring dependencies; this does not unlock higher-tier UI.
- Keep P0/P1 independently reliable before unlocking advanced work.
- Maintain deterministic simulation and golden regression values, including only the explicitly approved corrections recorded in master Section 65.0; never rebaseline to fit code.
- Keep domain logic out of UI components.
- Keep engine code pure and independent of DOM/Node/wall clock/random globals.
- Use Zod at external boundaries.
- Withhold hidden truth from trainees until COMPLETE; then use the authorized, temporally labelled post-mortem projection. Never copy raw instructor diagnostics into trainee views.
- Do not introduce external dependencies without justification.
- Synthetic scenario content must be visibly labelled.
- No critical demo dependency on an LLM, external API, live dataset, or network.
- Add or update tests for behavior changes.
- Run `npm run typecheck`, `npm test`, and `npm run build` at appropriate gates.

## UX

Prefer a serious, modern, information-dense training console over a generic dashboard. Every visualization must communicate a meaningful state. The demo must reach the first compelling state change quickly.

## Safety

Use fictional, abstract, non-operational scenarios only. Do not implement actionable military tactics, targeting, weapons employment, or battlefield procedures.

## Before changing a file

Check the applicable path-specific instruction file under `.github/instructions/` and the master specification. Preserve existing contracts unless the specification explicitly changes them.
