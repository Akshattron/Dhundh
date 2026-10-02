---
name: DHUNDH Server Rules
description: Express, WebSocket, session, authorization, and server-side redaction rules
applyTo: "server/**/*.ts,src/session/**/*.ts"
---
# Server/session rules

- The server is authoritative only for networked sessions.
- Client messages are untrusted input; validate them with the shared Zod protocol.
- Reject authority fields (`t`, `role`, `fromRole`) inside client intents; HELLO's role request still requires validated binding. Stamp intents with trusted role/time; local adapters do the same.
- Enforce role permissions and session ownership rules server-side, never only in the UI.
- Use explicit recursive projection allowlists, never raw engine/scenario/belief/instructor objects or effects. Preserve delivered role-visible information; before COMPLETE withhold truth, hidden report metadata, raw rho/stance, and truth-dependent consequences. Instructor data requires its separate authorization; completed post-mortem access never rewrites historical Knew views.
- Scope aid reveal and inspection to the role; withhold gated payloads rather than only blurring the UI. Analyst inspection/estimation must work without authorizing Analyst verification/decision.
- Preserve sequence numbers and deterministic ordering, including new sequence numbers for clock-only or error-only view changes. Admitted action rejection must not roll back due events.
- Keep WebSocket payloads bounded and reject malformed/oversized messages safely.
- Network failure must offer the documented fresh local session with the same scenario/seed/difficulty, not promise recovery of unavailable server progress. Distinguish local processing from network-session transmission/retention in privacy copy.
- Do not add persistent infrastructure unless the master specification explicitly requires it.
