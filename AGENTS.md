# DHUNDH — Repository Agent Instructions

This repository implements DHUNDH for SIH 2026 PS 26248: a web-based decision-training simulator for degraded, incomplete, delayed, and contradictory information.

## Authority

The authoritative engineering contract is:

- `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md`

Read that specification before making substantive code changes. It contains architecture, data contracts, algorithms, P0/P1/P2/P3 scope, UI requirements, tests, deployment, demo, and acceptance gates.

Do not invent major architecture or product decisions already made there.

## Build order

1. P0 safe core
2. P1 signature intelligence
3. Demo gate
4. P2 competitive edge
5. Selected P3 advanced features

P0 includes the exact mathematical dependencies of its scoring, belief, and AAR obligations, not approximations. This does not unlock higher-tier presentation. Only dependency-independent P3 work may start after Gate 4 as specified in master Section 58.7; network-dependent P3 waits for Gate 5. This exception does not waive P2 acceptance or multiplayer's last-P2-to-cut priority.

Never implement lower-priority work in a way that destabilizes a completed higher-priority gate.

## Non-negotiables

- Preserve deterministic simulation behavior.
- Keep the engine pure and testable.
- Never expose hidden truth to trainee views before completion.
- Label all scenario content as synthetic/fictional.
- No external API, network, or LLM may be required for the critical demo path.
- Do not add authentication, a database, microservices, VR/3D, maps, or unrelated features unless the master specification explicitly unlocks them.
- Never call deterministic heuristics or formulas “machine learning.”
- Keep the repository runnable after meaningful changes.
- Run the relevant tests and typecheck/build before declaring a milestone complete.

## Scope discipline

The project has a deliberate multi-day engineering schedule with a safety buffer. Advanced features are encouraged only after the core is stable and only when they create meaningful product value or judge-visible differentiation.

## Safety/domain boundary

Scenarios are fictional and non-operational. Do not implement real-world targeting, weapon employment, battlefield tactical procedures, or actionable military planning.
