---
name: DHUNDH UI Rules
description: React UI, interaction, visual hierarchy, accessibility, and demo UX rules
applyTo: "src/**/*.tsx,src/**/*.css,src/**/*.module.css"
---
# UI-specific rules

- Follow the master specification's screen map and component responsibilities.
- Keep domain calculations in the engine; components render view state and dispatch intents.
- Do not duplicate scoring or belief logic in React components.
- Keep the Trainee Console focused on state → intelligence → change → decision → consequence → explanation.
- Preserve information hierarchy; avoid generic dashboard-card proliferation.
- All loading, error, empty, disabled, and degraded states must be intentional.
- Maintain keyboard accessibility and visible focus states.
- Do not use color as the only carrier of meaning.
- Respect reduced-motion preferences.
- Use the locked typography, tokens, spacing, and icon strategy from the master specification.
- Use the single dark-neutral visual system; no theme switching. Token changes require measured contrast failure.
- Render only projected data. Per-role aid and report inspection gates must withhold unauthorized payloads; CSS blur is not redaction. Waterfall details follow the same gates as report details.
- Treat demo mode as a first-class UX path: quick start, deterministic scenario, obvious reset, reliable WOW moment.
- Keep stable data-test identifiers on demo-critical controls. Demo starts at 2 wall seconds per simulation minute; ordinary sessions retain the 4-second default.
