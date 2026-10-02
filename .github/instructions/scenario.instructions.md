---
name: DHUNDH Scenario Rules
description: Scenario JSON authoring, validation, fictional content, and synthetic-data rules
applyTo: "src/scenarios/**/*.json,src/engine/scenarioSchema.ts,src/engine/scenarioLoader.ts,scripts/validate-scenarios.ts"
---
# Scenario rules

- Every scenario is synthetic and fictional.
- Every scenario must satisfy the Zod schema and loader invariants.
- Preserve unique IDs, evidence-group semantics, decision-window validity, utility coverage, consequence coverage, and timing constraints.
- Scenario authors write minute-based timing where specified; the loader converts to integer simulation seconds.
- Keep at least one deterministic flagship path that reliably demonstrates delay, dropout, contradiction, uncertainty, decision, consequence, and AAR.
- Do not introduce real military doctrine, named real-world operations, targeting procedures, or weapon employment content.
- Seeded mutation must remain reproducible and must never make the scenario unplayable.
