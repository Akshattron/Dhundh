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

## Selected P3 features

### Replay controls and annotations

Completed AAR replay supports **0.5x, 1x, 2x, and 4x**, measured in retained
frames per wall-clock second, not simulated seconds. Speed changes only the
playback interval; they do not change timestamps, decisions, scores, or history.
The slider supports keyboard stepping and Home/End. Annotation jumps pause
playback and focus the exact retained frame.

Annotations identify actual scheduled events and accepted actions, including
reports, channels, verification, estimates, decisions, injects, relays, and
completion. Source IDs and causal order are preserved. Precommitment decision
cuts remain distinct from later work at the same second. The 80-frame bound
retains the initial, decision, and actual terminal cuts; annotations between
sampled frames are explicitly omitted, never reassigned to nearby times.
Conflict markers label the first retained cut with an available conflict flag.
Historical **Knew** respects that role's inspection and reference-aid gates.
**Truth** is explicitly post-mortem; counterfactuals remain labelled simulated,
not what happened.

### Completed-session team diagnostics

The authorized network AAR includes `team.metrics` and cumulative per-decision
details. These are descriptive diagnostics of a synthetic exercise, **not
scientifically validated learning-transfer measures or a composite team score**.
Live trainee snapshots do not include team analytics or another role's private
estimates.

| Metric                      | Exact definition                                                                                                                                                                                                                           | Missing-data behavior                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Information sharing rate    | Distinct Analyst-visible, non-relay reports sent before commitment whose absolute LLR at that decision cut is at least 0.3, divided by all such reports delivered by the cut. Uses the existing effective-accuracy/LLR model.              | Null when there are no meaningful opportunities; zero when opportunities exist but none were shared. Duplicate sends do not inflate the rate. |
| Estimate convergence        | One minus the absolute difference between the last Commander and Analyst primary-hypothesis estimates before commitment. Every paired update, first paired agreement, and final-minus-initial change are retained.                         | Null unless both actually estimated; no prior is substituted. Agreement is not correctness.                                                   |
| Median relay delay          | Median actual relay receipt minus original receipt, in simulated minutes, for predecision sends received by completion.                                                                                                                    | Null if none arrived. Includes labelled post-decision delivery; not evidence of decision use.                                                 |
| Median coordination latency | Median simulated seconds from a meaningful relay receipt to the first matching Commander action by commitment. Matching means opening that relay, estimating or verifying its hypothesis, or explicitly citing it in a voluntary decision. | Null if no response was observed. Late, missing, immaterial, or unanswered receipts never become zero latency.                                |

Each Commander action matches at most one receipt, oldest first. Meaningful
latency opportunities use absolute LLR at receipt, while sharing uses strength
at commitment. This explicit association does not prove causation. Counts,
individual opportunities, matched/unmatched receipts, and timeline context are
shown alongside the definitions.

Every decision uses its accepted-intent causal prefix, excluding later
same-second actions. Due scheduled receipts precede a voluntary decision.
Timeout-second trainee actions are excluded; a timeout is not a manufactured
Commander response. Metrics are cumulative from session start for each decision;
`team.metrics` summarizes the final cut. The panel shows the latest 24 paired
estimate cuts, while AAR JSON retains the full trajectory.

### Synthetic scenario workbench

Open **Author a synthetic scenario** from the library, or visit `/authoring`.
The monospaced editor runs debounced JSON syntax, Zod authoring-schema, loader,
runtime-invariant, utility/consequence coverage, and training-readiness checks.
Errors name the affected path. Readiness reuses the exact whole-minute
contradiction and feasible nonnegative-net verification gate used by mutation.
Loader-valid JSON can still fail that stricter training gate.

Reload a bundled template as a copy, import JSON, reset the draft, copy it, or
export its exact minute-based authoring form. No canonical scenario file is
written and no JavaScript is evaluated. Drafts are in-memory: export before
leaving. Preview requires all gates to pass and uses an **isolated
LocalSessionClient**, seed 0, the authored difficulty and timings, with no
mutation. It does not replace the active exercise or write session history.
Editing, replacing, or leaving the draft disposes the preview. Its projection
shows no hidden truth or instructor diagnostics; unanswered decisions time out
through the real engine.

The editor bounds drafts to 200,000 characters and imports to 800,000 bytes.
Limits are 6 hypotheses, 4 channels, 64 reports, 128 authored events, 12 assets,
16 inject presets, 4 decisions, 8 actions per decision, and 64 rules per
utility/consequence table. Decision close is at most 120 minutes; the authored
horizon, report/event times, and asset/consequence delays are at most 180
minutes. These are workbench resource limits, not changes to bundled scenarios.

### Live presentation

Use **Presentation mode** from a local/network console, the flagship demo, or a
completed AAR. Routes are `/presentation/local/:scenarioId`,
`/presentation/demo/:scenarioId`, and `/presentation/network/:sessionCode`.
They require the matching active client in this browser; they do not invent
state or reconnect under a guessed identity.

The simplified screen subscribes directly to the real client and shows large
clock, Fog Index and primary-belief metrics, current decision context, recent
role-visible events, pending consequence, and a clean authorized AAR summary
after completion. Estimate-first aid and report inspection gates remain intact.
An unavailable network connection is labelled as a last authoritative snapshot,
not advanced locally. Live instructor diagnostics are deliberately not projected
onto the judge screen; instructor presentation is available after completion.

Fullscreen requires the browser's permission and a user gesture; unsupported or
denied requests leave a usable windowed view with an explicit error. Exit
restores the contextual entry's focus and never disposes the real exercise.
Escape closes shortcut help, exits fullscreen, then leaves presentation.
Typing fields are not intercepted.

Demo presentation uses the original `DemoController`: H home, D reset, N next
event, J decision window, A complete the real path and show the AAR summary,
I return to instructor controls, and ? shortcut help. Use **Open decision
console** to make a real decision and **Open full AAR and replay** for the full
review. The ordinary demo's existing controls and shortcuts are unchanged.

**FR-P3-03 optional LLM-written AAR narration is deliberately omitted.** No LLM,
external API, or network is required by the local deterministic demo. Deployment
and submission readiness are separate gates; see `docs/PROGRESS.md`.
