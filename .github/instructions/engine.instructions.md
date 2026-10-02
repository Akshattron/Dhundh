---
name: DHUNDH Engine Rules
description: Deterministic simulation, domain-model, scoring, belief, replay, and scenario-engine rules
applyTo: "src/engine/**/*.ts"
---
# Engine-specific rules

- Keep engine modules pure TypeScript: no DOM, React, Node-only APIs, Date.now(), performance.now(), Math.random(), or environment-dependent behavior.
- Every state mutation must occur through the defined engine/session intent path.
- Preserve deterministic replay: same scenario + seed + ordered intents must produce equivalent state.
- Validate all scenario data at the boundary and enforce loader invariants.
- Keep the hidden truth inaccessible to trainee views until the allowed completion state.
- Use the exact formulas and contracts in `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md`.
- Do not silently alter golden values, score weights, event ordering, or schema semantics.
- Add focused unit tests for every new engine behavior and at least one regression case for changed calculations.
- Prefer small pure functions with explicit inputs/outputs over mutable service classes.
