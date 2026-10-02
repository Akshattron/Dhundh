# DHUNDH

Decision Training Under Degraded Information — SIH 2026 PS 26248.

The repository is governed by `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md` and the repository Copilot/agent instructions under `.github/`.

## Setup

Use Node **24.21.0** and npm from the existing repository root:

```sh
npm install
npm run validate:scenarios
npm test
npm run typecheck
npm run build
npm run dev
```

Open `http://localhost:5173` for the synthetic scenario library, local
training console, and network-session entry points. Express/ws listens on port
8787; `http://localhost:8787/health` and the proxied
`http://localhost:5173/health` expose health status. `/ws` carries the
server-authoritative multiplayer protocol.

`npm start` runs the server separately. With `NODE_ENV=production` it also serves
the built `dist` application. Set `PORT` in the process environment to override
the server port; the development proxy targets the default 8787. `.env.example`
documents configuration without creating a real `.env` or secrets.

The critical flagship demo remains deterministic and local. Multiplayer uses
the project-owned Express/WebSocket service and is not required for that demo.

## Deterministic engine

The pure TypeScript engine powers the local training console and multiplayer
authority. Engine state and raw event payloads remain internal; trainee screens
use role-specific projections.

`loadScenario` validates strict minute-based authoring data, converts once to
integer seconds, inserts automatic restores, and checks runtime references and
coverage. `validateRuntimeScenario` validates already-normalized data without
converting it again. `scenarioHash` uses canonical UTF-8 FNV-1a.

`npm run validate:scenarios` requires and validates the real flagship and every
other bundled JSON file. Additional JSON fixture paths may be passed after `--`;
any malformed input exits nonzero. No dependency versions have changed.

The engine API is exported from `src/engine/index.ts`: `createSession`,
`advanceTo`, `applyIntent`, and `replayLog`. Creation requires explicit seed,
difficulty, session mode, and aid mode. Engine state, event payloads, and effects
are internal data, **not trainee-facing projections**.

Only accepted intents belong in `SessionLog`, in their original causal order.
RESET creates fresh state and requires a fresh exercise log. Partial replay
requires `upToSec`; optional `upToIntentIndex` is zero-based and inclusive.
Default replay drains to the actual terminal event, not the final intent.
The 36-minute exercise horizon never truncates an authorized consequence:
South at 29:59 completes at 36:59, while a voluntary decision at 30:00 is illegal.

Malformed, forbidden, or invalid-time intents cannot advance the exercise.
Admitted action rejections preserve due scheduled work and return its effects.
Networked instructor injects, Analyst RELAY/ADVISE, and Commander decisions are
role-bound and stamped by the authoritative server.

Focused foundation checks: `npm test -- tests/engine tests/golden`.
Playwright covers the local flagship path and the multiplayer create/join,
role-partition, relay, reconnect, decision, and team-AAR flow. Actual gate
evidence and limitations are recorded in `docs/PROGRESS.md`.

## P2 scenario and difficulty foundation

The deterministic registry keeps `kestrel-relief-corridor` first and adds
`harbour-flood-response`: a synthetic flood-response exercise in fictional Port
Anand, with two decision points, shared evidence groups, and burst/noise/delay/
dropout feeds. Each decision receives its own causal-cut scores and CSV row;
the composite Training Score is the mean of the decision scores.

`mutateScenario(base, seed, level)` takes an already-normalized scenario. It
never reparses seconds as authored minutes. `PROFILES` and `nextDifficulty`
implement master Section 26. Local and network session creation apply the same
validated variant for the selected seed and difficulty. The canonical
`(seed: 0, level: 3)` returns the unchanged flagship, retaining hash
`1f7af0fb`.

Mutation changes information timing/volume, not truth, payoffs, assets, or score
formulas. Events use the first authored decision closing window after their
original issue/start time (the final window for later events); dropout restores
remain strictly before that variant deadline. Report/issue times and automatic
restores stay synchronized. Whole-minute belief/verification searches retain
the exact integer-second deadline and must establish reachable contradiction
and feasible nonnegative-net verification for each decision point.

Seeded operators use separate Mulberry32 streams. A failed variant retries from
the base with FNV-1a of the decimal `seed + attempt`, for at most 20 retries. A
deterministic-only fallback is returned only after it passes the same gates; its
warning is included in the synthetic briefing and AAR limitations. An invalid
fallback throws `ScenarioValidationError`. No console or global warning side
effect is needed. Variants never extend the exercise duration to force terminal
completion inside it. AAR JSON includes the selected difficulty profile.

Focused checks:
`npm test -- tests/engine/difficulty.test.ts tests/engine/mutation.test.ts tests/engine/harbour.test.ts`.

## Multiplayer and learning history

Network sessions use short join codes and participant-scoped reconnect
credentials. The server owns simulation time, intent ordering, role
authorization, report partitioning, relay delivery, instructor monitoring, and
post-completion team AAR access. Session state is intentionally in memory and
expires after six hours of inactivity; a server restart ends active sessions.

Completed AARs add score-only summaries to a bounded local history in the
current browser. Raw logs, rationale, estimates, and hidden truth are not
persisted in that history. Both local and network exercise setup expose
deterministic seed, difficulty, and reference-aid choices.
