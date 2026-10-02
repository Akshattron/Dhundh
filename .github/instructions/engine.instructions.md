---
name: DHUNDH Engine Rules
description: Deterministic simulation, domain-model, scoring, belief, replay, and scenario-engine rules
applyTo: "src/engine/**/*.ts"
---
# Engine-specific rules

- Keep engine modules pure TypeScript: no DOM, React, Node-only APIs, Date.now(), performance.now(), Math.random(), or environment-dependent behavior.
- Every state mutation must occur through the defined engine/session intent path.
- Preserve deterministic replay: same scenario/configuration + seed + ordered accepted intents + horizon must produce equivalent state. Dynamic events and event-order allocation belong in deterministic state, not a hidden mutable queue.
- Evaluate each decision at its deciding role's exact causal cut, including preceding events/intents but excluding later same-second work. Later truth must not rescore that decision.
- Reject malformed, unauthorized, and invalid-time requests before intent-driven progression. Admitted state-guard failures retain due scheduled progression but create no action-specific mutations.
- Validate all scenario data at the boundary and enforce loader invariants.
- Keep the hidden truth inaccessible to trainee views until the allowed completion state.
- Use the exact formulas and contracts in `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md`.
- Do not silently alter golden values, score weights, event ordering, or schema semantics.
- Add unit tests for every exported engine function, focused behavior tests, and at least one regression case for changed calculations. P0 must test all exact mathematics needed by its scores and AAR.
- Prefer small pure functions with explicit inputs/outputs over mutable service classes.
