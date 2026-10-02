---
name: DHUNDH Testing Rules
description: Unit, integration, golden, component, and end-to-end test conventions
applyTo: "tests/**/*.ts,tests/**/*.tsx,**/*.test.ts,**/*.test.tsx,**/*.spec.ts"
---
# Testing rules

- Test behavior, not implementation trivia.
- Protect deterministic engine behavior with golden and replay tests.
- Any formula change requires explicit numerical tests.
- Test negative paths: invalid intent, missing report, unavailable asset, late verification, role-forbidden action, malformed scenario, reconnect failure, and truth-redaction boundaries.
- UI tests should verify critical interactions and accessibility behavior rather than pixel snapshots alone.
- E2E tests should exercise the flagship demo path.
- Run the smallest relevant test first, then the full test suite before a milestone gate.
