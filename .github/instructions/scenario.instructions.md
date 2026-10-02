---
name: DHUNDH Scenario Rules
description: Scenario JSON authoring, validation, fictional content, and synthetic-data rules
applyTo: "src/scenarios/**/*.json,src/engine/scenarioSchema.ts,src/engine/scenarioLoader.ts,scripts/validate-scenarios.ts"
---
# Scenario rules

- Every scenario is synthetic and fictional.
- Every scenario must satisfy strict authoring Zod validation, one-time normalization, and normalized runtime invariants. Mutated second-based runtime data must not be reparsed as minute-based authoring JSON.
- Preserve unique IDs, evidence-group semantics, decision-window validity, utility coverage, consequence coverage, and timing constraints.
- Scenario authors write minute-based timing where specified; the loader converts once to integer simulation seconds and inserts automatic restores deterministically.
- Hash canonical runtime JSON using ordinal UTF-16 object-key order, preserved array order, UTF-8 FNV-1a 32-bit, and eight lowercase hexadecimal characters.
- Register only implemented, validated scenarios at the appropriate tier; do not create placeholders to satisfy the final tree.
- Keep at least one deterministic flagship path that reliably demonstrates delay, dropout, contradiction, uncertainty, decision, consequence, and AAR.
- Do not introduce real military doctrine, named real-world operations, targeting procedures, or weapon employment content.
- Seeded mutation must remain reproducible and must never make the scenario unplayable.
