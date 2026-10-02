---
name: DHUNDH Server Rules
description: Express, WebSocket, session, authorization, and server-side redaction rules
applyTo: "server/**/*.ts,src/session/**/*.ts"
---
# Server/session rules

- The server is authoritative only for networked sessions.
- Client messages are untrusted input; validate them with the shared Zod protocol.
- Stamp networked intents server-side with the connection's role and server simulation time.
- Enforce role permissions and session ownership rules server-side, never only in the UI.
- Never send hidden truth, unauthorized reports, instructor diagnostics, or role-invisible channels to trainees.
- Preserve sequence numbers and deterministic ordering.
- Keep WebSocket payloads bounded and reject malformed/oversized messages safely.
- Network failure must degrade to the documented local-mode fallback.
- Do not add persistent infrastructure unless the master specification explicitly requires it.
