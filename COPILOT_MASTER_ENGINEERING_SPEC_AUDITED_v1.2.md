# COPILOT_MASTER_ENGINEERING_SPEC.md

**Project:** DHUNDH (धुंध, "fog") — Decision Training Under Degraded Information
**Selected PS:** SIH 2026 / PS 26248 / Ministry of Defence (MoD) / Defence Services Staff College / Software / Smart Automation
**Spec version:** 1.2 — engineering-audited and consistency-patched 2 October 2026 for submission on 5 October 2026
**Audience:** GitHub Copilot Agent (autonomous). Every section is an instruction, not a discussion.

---

## 0. HOW TO USE THIS DOCUMENT (READ FIRST)

0.1 You MUST read this entire document before creating any file.
0.2 This document contains DECISIONS, NOT OPTIONS. Do not substitute libraries, frameworks, file names, schemas, or formulas. A substitution is allowed ONLY under Section 47.6 (compatibility blocker with evidence).
0.3 Build in strict priority order: P0 → P1 → P2 → P3. A tier unlocks only when the previous tier's gate passes (Section 58, Engineering Gates), except for explicitly dependency-independent P3 features identified in Section 58.7.
0.4 Keep the repository runnable (`npm run dev`, `npm run build`, `npm test`) at every commit.
0.5 Every number in Section 18 (golden values) is a fixed regression anchor derived from the worked reference calculations in this specification. If your TypeScript output differs by more than the stated tolerance, YOUR CODE IS WRONG, not the golden contract. The runtime MUST NOT depend on Python.
0.6 Never present synthetic content as real. Every scenario screen MUST show the badge `SYNTHETIC SCENARIO — fictional entities` (Section 38.9).
0.7 No external LLM or third-party API may be required for P0, P1, P2, or the demo path. P0/P1/Demo MUST work without network connectivity; P2 networked multiplayer uses only the project-owned WebSocket service when that mode is selected.
0.8 Words used as commands: CREATE, MODIFY, IMPLEMENT, VERIFY, TEST, DO NOT, MUST, SHOULD, ONLY AFTER, FALLBACK.
0.9 Provenance: the strategic selection process (26248 over 26251/26247/26241/26250) is already complete. Do NOT re-litigate it during implementation. If you hit a blocker, follow Section 55 (Stuck / Recovery Protocol), not a PS change.

### 0.10 Glossary (use these exact terms in code, UI copy, and the AAR)

| Term | Meaning |
|---|---|
| Hypothesis | A true/false statement about the world the trainee cannot directly observe (e.g. `north_pass` = "Veer Pass is passable") |
| Report | A message on a channel that supports, contradicts, or is neutral to one hypothesis |
| Channel | LAND, AIR, CYBER, EW — the four domains (information sources) |
| Reliability (ρ) | Scenario-assigned probability that a fresh report from a source is correct (0.5 < ρ < 1) |
| Effective accuracy (a) | Reliability after age decay and channel health |
| Belief (p) | The reference model's probability that a hypothesis is true, given delivered reports |
| Evidence group | A set of reports that are not independent (same underlying observation); counted once |
| Fog | Uncertainty; displayed as normalized entropy ("Fog Index") |
| Decision quality (DQ) | How good the decision was given the belief at decision time (NOT given the truth) |
| Outcome | What actually happened under the hidden truth |
| EVPI | Expected value of perfect information — the "price of fog" at a moment |
| EVSI / VOI | Expected value of sample (verification) information; net VOI subtracts time and asset cost |
| AAR | After-action review |
| Truth | Hidden ground-truth state; never sent to a trainee client before the AAR |

---

## 1. EXECUTIVE ENGINEERING SUMMARY

1.1 DHUNDH is a web-based training simulator in which a commander makes one time-critical, irreversible choice while information from four domains (land, air, cyber, electronic-spectrum) arrives late, goes missing, or contradicts itself.

1.2 The product's single distinguishing idea is **information-conditioned evaluation**: the system scores a decision against what the trainee could have known at the instant of decision (belief state), separately from what turned out to be true (outcome). Decisions are explained with three numbers: regret under belief, price of fog (EVPI), and net value of verification.

1.3 The system is a deterministic event-sourced simulation. State is a pure function of (scenario, seed, ordered intents). This gives: reproducible demos, deterministic replay, counterfactual re-simulation, and a golden regression test.

1.4 Architecture in one line: React + Vite + TypeScript client; a pure-TypeScript engine shared by client and server; an Express + `ws` server that is authoritative ONLY for networked sessions; local (serverless) mode runs the same engine in the browser; no database; no authentication; browser `localStorage` for history.

1.5 Deliverables: (a) deployed web app, (b) flagship scenario `kestrel-relief-corridor` plus one secondary scenario (P2), (c) instructor console with live injects, (d) two-trainee multiplayer (P2) with a relay mechanic, (e) exportable AAR (print-to-PDF, JSON, CSV), (f) deterministic Demo Mode.

1.6 What is real vs simulated (MUST be stated in the UI footer and the PPT):
- REAL: the event engine, belief fusion, decision/regret/EVPI/EVSI computation, scoring, AAR generation, replay, counterfactual re-simulation, multiplayer synchronization.
- SIMULATED/SYNTHETIC: all scenario content, reports, reliabilities, utilities, entities, geography. Reliability values and utilities are scenario-author assumptions, not doctrine and not empirical measurements.
- NOT CLAIMED: training transfer effectiveness. The prototype provides measurement; it does not claim to have been validated for learning outcomes.

---

## 2. SELECTED PS AND OFFICIAL REQUIREMENT MAPPING

### 2.1 Official wording (source of truth: uploaded `Latest Problem Statement.txt`)

- **ID:** 26248
- **Title:** Immersive Multi-Domain Decision-Making Trainer for Degraded Communication Environments
- **Organization / Department:** Ministry of Defence (MoD) / Defence Services Staff College
- **Category / Theme:** Software / Smart Automation
- **Detailed description (paraphrase marker only; do not alter in the PPT):** an AR/VR or web-based tool placing small-team and sub-unit commanders in multi-domain (land-air-cyber-EW) scenarios where information feeds are deliberately incomplete, delayed, or contradictory, to train decision-making under uncertainty.
- **Expected outcomes (four):**
  1. Scenario engine capable of injecting communication degradation (delay, dropout, conflicting reports) mid-exercise.
  2. Multiplayer capability for team-level coordination under degraded information.
  3. Instructor dashboard to configure scenario variables and monitor trainee decisions in real time.
  4. Exportable AAR reports capturing individual and team decision timelines and rationale.

### 2.2 Official Requirement → Product Feature → Implementation → Demonstration Evidence

| # | Official requirement | Product feature | Implementation (files) | Demonstration evidence |
|---|---|---|---|---|
| R1 | "web-based tool" (AR/VR or web) | Browser-based console, no install | `src/` Vite app; `server/` | Open deployed URL on a laptop |
| R2 | Multi-domain (land-air-cyber-EW) | Four channels with distinct sources, delays, reliabilities, health | `src/engine/channels.ts`, `degradation.ts`, scenario JSON `channels` | Channel Health Strip shows LAND/AIR/CYBER/EW independently degrading |
| R3 | Information deliberately incomplete | Dropout mode drops reports; AAR "What you never saw" lists them | `degradation.ts` (`DROPOUT`), `aar.ts` (`droppedReports`) | Report R10 dropped at t=20; AAR reveals it and its effect on belief |
| R4 | Information delayed | Delay + burst modes; reports carry issuedAt vs deliveredAt and age | `degradation.ts`, `ReportCard.tsx` | R06 issued 16:00, delivered 22:00 (+6) visible on card |
| R5 | Information contradictory | Contradiction engine + visible Contradiction Meter + opposing-report linking | `contradiction.ts`, `ContradictionMeter.tsx` | At t=22 contradiction index 0.92 flagged |
| R6 | Train decision-making under uncertainty | Single irreversible decision with verify/wait trade-off; regret and EVPI scoring | `decision.ts`, `voi.ts`, `scoring.ts` | AAR "Quadrant" (decision quality vs outcome) |
| E1 | Scenario engine injects delay/dropout/conflicting reports mid-exercise | Scheduled degradation events + live instructor injects | `simulation.ts`, `events.ts`, instructor `InjectPanel.tsx` | Instructor presses "Jam LAND" during the run; feed changes immediately |
| E2 | Multiplayer team-level coordination | Two trainee roles (Commander, Analyst) with partitioned channel visibility and a rate-limited relay | `server/`, `src/session/RemoteSessionClient.ts`, `RelayPanel.tsx` | Two browser windows; Analyst relays a CYBER report to Commander |
| E3 | Instructor dashboard: configure variables + monitor decisions in real time | Instructor Console with scenario parameters (before start), live monitor of trainee state, injects, pause/speed | `features/instructor/*` | Live monitor shows trainee opened reports, estimate, belief, decision |
| E4 | Exportable AAR with individual + team decision timelines and rationale | AAR page; rationale captured at decision (text + cited reports + tags); export JSON/CSV/print-PDF | `engine/aar.ts`, `features/aar/*`, `export.ts` | Click Export; downloaded files contain timeline and rationale |

2.3 Project compliance target: all four expected outcomes listed in the PS source are targeted for implementation. They are expected outcomes in the PS, not official SIH labels such as "MUST-SHIP". E2 (multiplayer) is a highest-priority P2 target and the last P2 feature to cut under Section 56 if time or infrastructure forces a cut. If cut, the PPT MUST state "single-trainee mode implemented; multiplayer architecture validated in LocalSessionClient/RemoteSessionClient split" — never claim multiplayer if it does not run.

---

## 3. PRODUCT THESIS AND ENGINEERING VALIDATION OF IT

### 3.1 Thesis
Traditional outcome-only evaluation asks "was the decision right?". DHUNDH asks "what was the quality of the decision given the information actually available when it was made?", then separately shows what the truth was and what verification or earlier information would have been worth.

### 3.2 Validation research (summarized; used to constrain design)

| # | Evidence | Source quality | Design consequence |
|---|---|---|---|
| V1 | Outcome bias: people rate the same decision lower when it happens to turn out badly; information available only after the decision is irrelevant to its quality. Original: Baron & Hershey (1988), J. Personality & Social Psychology 54(4). A 2023 pre-registered replication (N=692, International Review of Social Psychology) found the effect, with larger effect sizes than the original. | Peer-reviewed, replicated | Evaluate decisions against belief at decision time. Display outcome separately and never fold it into decision quality. Outcome weight in the composite is capped at 15%. |
| V2 | After-action review meta-analyses: Keiser & Arthur (2021, J. Applied Psychology): 61 studies, overall d = 0.79; effectiveness associated with alignment to the individual/team and objective performance review media. Keiser & Arthur (2022, J. Business and Psychology): 83 studies, d = 0.92. Tannenbaum & Cerasoli (2013, Human Factors): roughly 20–25% performance improvement from properly conducted debriefs. | Peer-reviewed meta-analyses | AAR is a first-class feature. AAR MUST use objective recorded data (timeline of what arrived/was opened/was decided) and MUST be aligned to the individual (per-trainee) and the team (multiplayer). High-structure format (fixed sections) is used. |
| V3 | Calibration training: Mellers et al. (2014, Psychological Science) reported that probability training improved calibration and resolution in a forecasting tournament. A 2025 reanalysis (Hauenstein et al., Psychological Science) disputes the size/direction of the training and teaming effects after controlling method variance. | Peer-reviewed, CONTESTED | Calibration is displayed but weighted only 5% and is never described as a proven training effect. No claim of "improves calibration" appears anywhere in UI/PPT. |
| V4 | Industry write-ups describe degraded-communications modelling as under-implemented in military training simulation and recommend modelling the training effect (delay, dropout, conflicting reports), not network protocols. | Vendor blog, moderate quality | Model the training effect only (Section 21). No protocol simulation. Do not claim novelty ("first"); claim "decision-time-conditioned scoring with EVPI/EVSI in an open web prototype". |
| V5 | Render free web services spin down after ~15 minutes idle and wake on the next HTTP request or new WebSocket connection (Render docs); health checks gate deploys; free tier has no persistent disk (documentation by third-party deployers). | Official docs + secondary | Deployment: Render primary + static fallback; a pre-demo warm-up step; in-memory sessions with TTL; local mode as demo safety net (Section 42). |

### 3.3 Pedagogical design rules derived from V1–V5
3.3.1 Do not reward caution blindly: `STAND_DOWN` has a fixed moderate utility (10) below the best GO action under any belief that favours that GO action; the engine reports `postureLabel = OVER_CAUTIOUS` when the trainee stood down while a GO action had higher expected value.
3.3.2 Do not reward aggression blindly: GO actions carry large negative utility (−80) in the failing state; `postureLabel = OVER_COMMITTED` when a GO action was chosen while the reference belief favoured another action.
3.3.3 Latency is measured but low-weighted (10%), and verification wait that was net-positive is excluded from the latency penalty.
3.3.4 Information-seeking (verify) is a first-class action with explicit time and asset costs; the AAR states whether verification was worth it using EVSI minus costs.
3.3.5 Decision quality is measured against the scenario's reference belief model, which is declared and inspectable in the UI ("Reference model" drawer). It is NOT measured against doctrine or ground truth. The UI MUST state this.
3.3.6 The system never claims the reference belief is the "correct" belief in the real world; it is the transparent normative baseline for a synthetic scenario.

### 3.4 Known limitations (MUST appear in an "About this model" drawer and the PPT)
- Binary hypotheses; conditional independence between evidence groups; scenario-authored reliabilities and utilities.
- Single-decision flagship; multi-decision scenarios supported by schema, only scenario 2 uses two decision points (P2).
- No validation study of learning transfer.
- Calibration metrics on a single decision are noisy; meaningful only aggregated over sessions (P2 analytics).

---

## 4. PRODUCT PRINCIPLES

| # | Principle | Engineering consequence |
|---|---|---|
| PP1 | State → Intelligence → Change → Decision → Consequence → Explanation | Every screen shows at least one of these links; no data-only screens |
| PP2 | Determinism beats cleverness | Seeded RNG, event sourcing, golden test |
| PP3 | Every number is explainable in one sentence | Each metric has a tooltip with formula + example (Section 24) |
| PP4 | Honest labelling | `SYNTHETIC`, `SIMULATED`, `DETERMINISTIC` badges; never "AI" for deterministic logic |
| PP5 | One primary screen carries the central intelligence | Trainee Console (Section 38.4) |
| PP6 | Fog is visible | UI literally reduces contrast/sharpness of low-weight evidence (Fog Veil, Section 36.5) |
| PP7 | Demo path under 60 seconds to first WOW | Demo Mode (Section 39) |

---

## 5. USER PERSONAS

| Persona | Role | Goals | Primary screens |
|---|---|---|---|
| P-Trainee "Capt. Meera Rao" (fictional) | Sub-unit commander in training | Practice deciding under fog; see why a decision was good or bad independent of luck | Briefing, Trainee Console, AAR |
| P-Analyst "Lt. Arjun Sethi" (fictional) | Staff analyst on cyber/EW channels (multiplayer) | Filter and relay critical reports to the commander within limited bandwidth | Trainee Console (Analyst role), Relay panel |
| P-Instructor "Maj. Kavita Nair" (fictional) | Exercise controller | Configure scenario variables, inject degradation mid-run, monitor decisions live, hold a structured debrief | Instructor Console, AAR |
| P-Judge | SIH evaluator | Understand in 60 s, see it working, probe honesty | Demo Mode, AAR, About model drawer |

Persona names are fictional and MUST NOT map to real people.

---

## 6. USER JOURNEYS

6.1 **Solo trainee (local mode)**: Home → Scenario Library → Briefing → Trainee Console (run ~2:30) → Decide → Consequence → AAR → Export.
6.2 **Instructor-led session (networked)**: Instructor creates session (code) → Trainees join with code and role → Lobby → Instructor starts → Live monitoring and injects → Decision → Consequence → shared AAR.
6.3 **Judge demo**: Home → "Run flagship demo" → guided overlay + automated degradation → trainee (presenter) decides → AAR → Quadrant explanation. Target: first WOW (contradiction + fog spike) by 60 s of wall time.
6.4 **Repeat training**: Analytics shows history; difficulty adapts (P2); scenario mutation yields a new seed variant.

---

## 7. FUNCTIONAL REQUIREMENTS (numbered; each has a test or acceptance item in Section 50)

### 7.1 P0 — Safe core (single trainee, local mode)
FR-P0-01 Load and schema-validate scenario JSON; fail loudly on invalid scenarios.
FR-P0-02 Deterministic event engine advancing simulated time; pause/resume; reset.
FR-P0-03 Four channels with health states HEALTHY, DEGRADED, DOWN; delay, dropout, burst, noise modes.
FR-P0-04 Report lifecycle: SCHEDULED → IN_TRANSIT → DELIVERED | DROPPED; shown with issuedAt, deliveredAt, age.
FR-P0-05 Trainee Console: report feed, channel health strip, belief panel (probabilities + Fog Index), evidence ledger, timeline bar, decision panel.
FR-P0-06 Actions: OPEN_REPORT, SET_ESTIMATE, VERIFY (two assets), DECIDE (GO_NORTH, GO_SOUTH, STAND_DOWN), with rationale capture.
FR-P0-07 Decision window with deadline; timeout forces `STAND_DOWN` with `timedOut=true` and a latency penalty.
FR-P0-08 Consequence phase revealing truth and scripted narrative.
FR-P0-09 Scoring: DQ, Outcome, Information Utilization, Timeliness, Verification Efficiency, Calibration Alignment, composite Training Score.
FR-P0-10 AAR page: header, score card, quadrant, timeline replay scrubber, "What you knew / What was true / What you never saw", deterministic coach notes.
FR-P0-11 Demo Mode with reset in under 3 seconds.
FR-P0-12 Golden test `FLAGSHIP_DEMO` passes.

### 7.2 P1 — Signature intelligence
FR-P1-01 Reliability-weighted belief fusion with age decay, evidence groups, contradiction index, entropy (Section 22).
FR-P1-02 Reference-model drawer exposing formulas and current parameter values.
FR-P1-03 Evidence waterfall visualization (log-odds contributions) (Section 36.6).
FR-P1-04 Regret under belief, EVPI ("price of fog"), EVSI and net VOI for verify options; AAR "Verification analysis".
FR-P1-05 Information-conditioned scoring and quadrant labelling (SOUND_SUCCESS, SOUND_UNLUCKY, LUCKY, POOR).
FR-P1-06 Counterfactual replay (alternative action; earlier verification; earlier decision) clearly labelled `COUNTERFACTUAL — simulated`.
FR-P1-07 Dropped/late-report reveal with "what-if delivered" belief recomputation.
FR-P1-08 Instructor Console (embedded drawer in local mode; standalone route in networked mode) with live inject presets and speed control.
FR-P1-09 Deterministic session replay with scrubber.

### 7.3 P2 — Competitive edge (official-requirement items marked ★)
FR-P2-01★ Networked sessions: create/join by code, roles INSTRUCTOR/COMMANDER/ANALYST, authoritative server, reconnect.
FR-P2-02★ Relay mechanic (Analyst → Commander) and partitioned channel visibility.
FR-P2-03★ Instructor live monitor of trainee actions in real time.
FR-P2-04 Second scenario `harbour-flood-response` with two decision points.
FR-P2-05 Scenario mutation (seeded) and adaptive difficulty with explanation.
FR-P2-06 Estimate-first aid mode (fusion panel fogged until the trainee commits an estimate).
FR-P2-07 History/Analytics page (localStorage): sessions, DQ trend, calibration table, recurring patterns.
FR-P2-08 Playwright end-to-end demo test.

### 7.4 P3 — Advanced
FR-P3-01 Team metrics (information sharing rate, convergence, coordination latency).
FR-P3-02 Scenario authoring page (JSON editor with live validation + preview).
FR-P3-03 Optional LLM-written AAR narrative (server endpoint, env-gated; never alters scores).
FR-P3-04 Presentation mode (fullscreen judge view with large type).
FR-P3-05 Replay speed controls and event annotations.

---

## 8. NON-FUNCTIONAL REQUIREMENTS

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | First load (production build, desktop, broadband) | ≤ 2.5 s interactive; JS bundle ≤ 450 KB gzip |
| NFR-02 | Engine step processing (flagship, full 36-minute run) | ≤ 15 ms total per `advanceTo` call; full-session replay ≤ 100 ms |
| NFR-03 | UI frame budget during clock ticks | No dropped frames at 60 fps on a mid laptop; clock tick at 4 Hz |
| NFR-04 | WebSocket round trip (same region) | ≤ 250 ms p95 |
| NFR-05 | AAR generation | ≤ 150 ms |
| NFR-06 | Determinism | Same (scenario, seed, intents) → byte-identical `SimState` JSON (excluding wall-clock fields) |
| NFR-07 | Accessibility | WCAG 2.1 AA contrast; full keyboard operation of Trainee Console |
| NFR-08 | Browser support | Latest Chrome, Edge, Firefox, Safari (desktop); tablet graceful |
| NFR-09 | Reliability | Local mode works with network disabled |
| NFR-10 | Security | No secrets in client; no truth leakage in networked trainee views |

---

## 9. SCOPE EXCLUSIONS (DO NOT BUILD)

DO NOT build: authentication, user accounts, a database, microservices, 3D/VR/AR views, map/GIS views, chat between users beyond the structured relay, payment, email, notifications, an admin CMS, i18n, dark theme, PWA/offline caching, real military doctrine content, weapon/targeting/tactical procedures, any ML training pipeline, any LLM dependency in P0–P2.

---

## 10. ARCHITECTURE

### 10.1 Component diagram

```text
┌──────────────────────────── Browser (React SPA) ─────────────────────────────┐
│  features/*  (screens)  ──uses──►  state/* (Zustand stores: VIEW ONLY)       │
│        │                                   ▲                                 │
│        ▼                                   │ SessionView (redacted by role)  │
│  session/SessionClient  (interface)  ──────┘                                 │
│     ├─ LocalSessionClient   ── runs engine in-page (closure-private state)   │
│     └─ RemoteSessionClient  ── WebSocket to server (authoritative)           │
│                                                                              │
│  src/engine/*  (PURE TypeScript: no DOM, no Node APIs, no Date.now, no       │
│                  Math.random) — shared by browser AND server                 │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ wss://  (JSON, zod-validated)
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ server/ (Node 24 LTS, Express + ws)                                           │
│   SessionManager: Map<code, Session{ engineState, log, clients, seq }>       │
│   Clock loop (500 ms): advances simTime for RUNNING sessions                 │
│   projectView(state, role) → per-client SessionView (truth redacted)         │
│   REST: /health, /api/scenarios, /api/sessions (create), /api/sessions/:code │
│   Static: serves dist/ in production; SPA fallback to index.html             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Modes
- **Local mode (default; used for Demo Mode):** `LocalSessionClient` owns a closure containing the full `SimState` (including truth). It pushes only `projectView(state, 'SOLO')` into the store. Clock is a wall-clock timer in the browser. Works offline.
- **Networked mode (P2):** `RemoteSessionClient` connects to `/ws`. The server owns state; clients send intents; the server broadcasts a role-specific `SessionView` after every applied change and on every clock tick that changes the view.

### 10.3 Core design decisions (final)
D1 Event-sourced deterministic engine. State = f(scenario, seed, intents). Replay = re-apply intents.
D2 Time unit: integer simulated **seconds** (`SimSeconds`). Scenario JSON is authored in minutes (`atMin`) and converted with `Math.round(min * 60)` at load.
D3 One shared engine package inside `src/engine/` imported by both client and server (server imports via relative path `../src/engine/index`). No monorepo tooling.
D4 Server sends full `SessionView` snapshots (not deltas). View size < 40 KB; tick rate 2 Hz max.
D5 Truth never leaves the server (networked) or the engine closure (local) until the session phase is `COMPLETE`.
D6 No database. Server memory + client `localStorage`.
D7 No authentication. Session code (6 chars) + per-client token for reconnect.
D8 LLM is optional (P3) and cannot influence any score.

### 10.4 Truth redaction rules (`engine/view.ts: projectView`)
1. `truth` is included only when `phase === 'COMPLETE'` or role is `INSTRUCTOR`.
2. Reports with status `SCHEDULED`, `IN_TRANSIT` or `DROPPED` are included only for INSTRUCTOR (and for all roles after COMPLETE, under `postMortem`).
3. Reports on channels not visible to the role are excluded unless relayed to that role.
4. `belief` is computed server-side from delivered reports visible to the role. For ANALYST/COMMANDER the belief panel uses only the reports that role can see (team belief is shown in AAR only).
5. Scenario `utility` tables are included in views (the trainee is allowed to see payoffs in the briefing); `truth` and `hiddenNotes` are not.

---

## 11. TECHNOLOGY LOCK

```text
Frontend:            React 19.3.0, react-dom 19.3.0
Language:            TypeScript (strict: true, noUncheckedIndexedAccess: true)
Build tool:          Vite 8.3.2 + @vitejs/plugin-react
Routing:             react-router-dom (createBrowserRouter)
Styling:             CSS Modules (*.module.css) + global design tokens in src/styles/tokens.css
UI component strategy: Hand-written primitives in src/components/ui (no component library)
State management:    Zustand (view stores only; engine state is NOT in Zustand)
Charts/visualization: Hand-written SVG React components (no chart library)
Icons:               lucide-react
Fonts:               @fontsource/ibm-plex-sans (400,500,600), @fontsource/ibm-plex-serif (400,600) — self-hosted via npm
Validation:          zod (scenario schema, WebSocket protocol, REST bodies)
Backend:             Node 24.21.0 LTS, Express, ws
Realtime:            ws with a custom JSON protocol (Section 33.3); no socket.io
Persistence:         None server-side. Browser localStorage (versioned keys) client-side
Testing:             Vitest (unit/integration/golden), @testing-library/react + jsdom (component), @playwright/test (P2 e2e)
Deployment:          Render Web Service (primary, full features) + Vercel static deploy (fallback, local mode only)
Package manager:     npm (commit package-lock.json)
Runtime for server:  tsx (no separate server build step)
Dev orchestration:   concurrently
Lint/format:         tsc --noEmit as the lint gate; Prettier (default config) formatting only
```

### 11.0 Runtime pin files
CREATE `.node-version` containing exactly `24.21.0`. CREATE `.nvmrc` containing exactly `24.21.0`. These pins complement the bounded `package.json` engine range and make local/Render runtime selection explicit.

### 11.1 Dependency policy

The audited baseline is Node 24.21.0 LTS, React 19.3.0, Vite 8.3.2, Zod 4.6.5, and Zustand 5.0.15. Exact versions of remaining packages are resolved once at project creation and captured in `package-lock.json`; do not perform unplanned major upgrades during the sprint.
- Install the latest stable release of each package at project creation; commit the lockfile; DO NOT upgrade major versions mid-build.
- DO NOT add a dependency that is not listed here without a written justification in `docs/DEPENDENCY_LOG.md` (package, reason, alternative rejected, bundle impact).
- Avoid abandoned packages (no release in 24 months) — none are used here.

### 11.2 Exact install bootstrap (run once)

If the current working directory is the intended empty project root, use:

```bash
npm create vite@latest . -- --template react-ts
```

If a parent directory should contain the project, create the `dhundh` directory once and run the scaffold there. NEVER create `dhundh/dhundh`.

Then install runtime dependencies:

```bash
npm install react-router-dom zustand zod lucide-react @fontsource/ibm-plex-sans @fontsource/ibm-plex-serif express ws tsx
```

Then install development dependencies:

```bash
npm install -D concurrently vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/express @types/ws @types/node prettier @playwright/test
```

### 11.3 `package.json` scripts (CREATE exactly)
```json
{
  "scripts": {
    "dev": "concurrently -k -n web,srv -c blue,green \"vite\" \"tsx watch server/index.ts\"",
    "build": "tsc --noEmit && vite build",
    "start": "tsx server/index.ts",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:golden": "vitest run tests/golden",
    "typecheck": "tsc --noEmit",
    "validate:scenarios": "tsx scripts/validate-scenarios.ts",
    "e2e": "playwright test",
    "format": "prettier --write ."
  },
  "engines": { "node": ">=24.21.0 <25" }
}
```
`start` MUST be platform-neutral: `tsx server/index.ts`. Render sets `NODE_ENV=production` through service configuration. Do NOT add `cross-env` unless a concrete command-shell compatibility issue is reproduced.

### 11.4 `vite.config.ts` requirements
- `plugins: [react()]`.
- `server.proxy`: `'/api' → http://localhost:8787`, `'/ws' → { target: 'ws://localhost:8787', ws: true }`, `'/health' → http://localhost:8787`.
- `build.sourcemap: false`; `define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) }`.
- Env: `VITE_FORCE_LOCAL` (`'1'` builds the static-fallback variant: hides networked UI).

### 11.5 `tsconfig.json` requirements
`target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `noUncheckedIndexedAccess: true`, `jsx: react-jsx`, `resolveJsonModule: true`, `isolatedModules: true`, `include: ["src", "server", "tests", "scripts"]`. Path alias: `@/*` → `src/*` (Vite alias AND tsconfig paths; the server and scripts use RELATIVE imports only, never the alias).

---

## 12. PROJECT STRUCTURE (CREATE exactly this tree)

```text
dhundh/
├── COPILOT_MASTER_ENGINEERING_SPEC.md
├── README.md
├── package.json / package-lock.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── index.html
├── render.yaml
├── vercel.json
├── .env.example
├── .gitignore
├── .node-version                    # exact Render/local Node pin: 24.21.0
├── .nvmrc                            # exact Node pin: 24.21.0
├── docs/
│   ├── DEPENDENCY_LOG.md
│   ├── PROGRESS.md                    # agent updates after each gate
│   └── MODEL_CARD.md                  # reference-model assumptions (Section 3.4)
├── scripts/
│   ├── validate-scenarios.ts
│   └── run-golden.ts                  # prints golden metrics table
├── server/
│   ├── index.ts                       # express + ws bootstrap
│   ├── config.ts
│   ├── sessions.ts                    # SessionManager
│   ├── wsHandlers.ts                  # connection lifecycle, message routing
│   ├── protocol.ts                    # re-exports src/session/protocol.ts
│   ├── routes.ts                      # REST
│   └── narrate.ts                     # P3 LLM narration (env-gated)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   ├── vite-env.d.ts
│   ├── engine/                        # PURE TS — no DOM/Node/Date/Math.random
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── rng.ts                     # mulberry32
│   │   ├── time.ts                    # min↔sec, formatting helpers
│   │   ├── scenarioSchema.ts          # zod
│   │   ├── scenarioLoader.ts          # validate + invariants + convert minutes→seconds
│   │   ├── events.ts                  # event ordering, priorities
│   │   ├── channels.ts                # channel runtime + health
│   │   ├── degradation.ts             # delay/dropout/burst/noise application
│   │   ├── simulation.ts              # createSession, advanceTo, applyIntent
│   │   ├── belief.ts                  # fusion, decay, groups
│   │   ├── contradiction.ts
│   │   ├── entropy.ts
│   │   ├── decision.ts                # utilities, EU, regret, posture
│   │   ├── voi.ts                     # EVPI, EVSI, net VOI
│   │   ├── scoring.ts                 # metrics + composite
│   │   ├── calibration.ts             # Brier, alignment, reliability bins
│   │   ├── aar.ts                     # AAR builder
│   │   ├── coach.ts                   # deterministic coach-note rules
│   │   ├── replay.ts                  # frames from SessionLog
│   │   ├── counterfactual.ts
│   │   ├── mutation.ts                # P2
│   │   ├── difficulty.ts              # P2
│   │   ├── view.ts                    # projectView (role redaction)
│   │   └── export.ts                  # AAR → JSON / CSV / printable model
│   ├── scenarios/
│   │   ├── index.ts                   # registry
│   │   ├── kestrel-relief-corridor.json
│   │   └── harbour-flood-response.json   # P2
│   ├── session/
│   │   ├── SessionClient.ts           # interface
│   │   ├── LocalSessionClient.ts
│   │   ├── RemoteSessionClient.ts
│   │   └── protocol.ts                # zod message schemas (shared with server)
│   ├── state/
│   │   ├── useSessionStore.ts
│   │   ├── useUiStore.ts
│   │   └── useHistoryStore.ts
│   ├── features/
│   │   ├── home/HomePage.tsx
│   │   ├── library/ScenarioLibraryPage.tsx
│   │   ├── briefing/BriefingPage.tsx
│   │   ├── trainee/{TraineeConsolePage.tsx, ReportFeed.tsx, ReportCard.tsx, ChannelHealthStrip.tsx, BeliefPanel.tsx, EvidenceWaterfall.tsx, FogMeter.tsx, ContradictionMeter.tsx, DecisionPanel.tsx, VerifyPanel.tsx, RationaleDialog.tsx, TimelineBar.tsx, ReferenceModelDrawer.tsx, RelayPanel.tsx}
│   │   ├── instructor/{InstructorConsolePage.tsx, InjectPanel.tsx, ParametersPanel.tsx, LiveMonitor.tsx, SessionControls.tsx}
│   │   ├── lobby/{JoinPage.tsx, LobbyPage.tsx}
│   │   ├── aar/{AarPage.tsx, ScoreCard.tsx, DecisionQuadrant.tsx, ReplayScrubber.tsx, KnewVsTruth.tsx, NeverSeenPanel.tsx, VerificationAnalysis.tsx, CounterfactualTabs.tsx, CalibrationCard.tsx, CoachNotes.tsx, ExportMenu.tsx}
│   │   ├── demo/{DemoPage.tsx, DemoOverlay.tsx, DemoControllerBar.tsx}
│   │   ├── analytics/AnalyticsPage.tsx
│   │   └── authoring/AuthoringPage.tsx   # P3
│   ├── components/ui/  {Button, Chip, Card, Panel, Tooltip, Dialog, Tabs, Slider, Badge, Kbd, Toast, EmptyState, ErrorBoundary, VisuallyHidden}.tsx (+ .module.css)
│   ├── hooks/   {useSession.ts, useKeyboardShortcuts.ts, useReducedMotion.ts, useNow.ts}
│   ├── utils/   {format.ts, download.ts, storage.ts, invariant.ts}
│   └── styles/  {tokens.css, global.css, print.css}
└── tests/
    ├── reference/   {reference_model.py}
    ├── engine/   {belief.test.ts, contradiction.test.ts, degradation.test.ts, decision.test.ts, voi.test.ts, scoring.test.ts, determinism.test.ts, replay.test.ts, counterfactual.test.ts, scenarioSchema.test.ts, view.test.ts}
    ├── golden/   {flagship.test.ts, flagship.expected.ts}
    ├── server/   {sessions.test.ts, protocol.test.ts}
    ├── ui/       {TraineeConsole.test.tsx, ReportCard.test.tsx, AarPage.test.tsx}
    └── e2e/      {demo.spec.ts}
```

12.1 CREATE `.env.example`:
```bash
PORT=8787
NODE_ENV=development
SESSION_TTL_MINUTES=360
MAX_SESSIONS=50
ALLOWED_ORIGINS=http://localhost:5173
# P3 narration is not part of the committed demo path. Do not configure an LLM unless every non-LLM P3 target is complete.
```

---

## 13. DOMAIN MODEL (CREATE `src/engine/types.ts` with exactly these exports)

```ts
// ---------- primitives ----------
export type SimSeconds = number;                       // integer, >= 0
export type ChannelId = 'LAND' | 'AIR' | 'CYBER' | 'EW';
export type RoleId = 'SOLO' | 'COMMANDER' | 'ANALYST' | 'INSTRUCTOR';
export type Stance = -1 | 0 | 1;                       // -1 = supports "false", +1 = supports "true", 0 = neutral
export type HypothesisId = string;
export type ReportId = string;
export type ActionId = string;
export type AssetId = string;
export type EvidenceGroupId = string;

export type ChannelMode = 'HEALTHY' | 'DELAY' | 'DROPOUT' | 'BURST' | 'NOISE';
export type ChannelHealth = 'HEALTHY' | 'DEGRADED' | 'DOWN';
export type ReportStatus = 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'DROPPED';
export type Phase = 'IDLE' | 'RUNNING' | 'PAUSED' | 'CONSEQUENCE' | 'COMPLETE';
export type Quadrant = 'SOUND_SUCCESS' | 'SOUND_UNLUCKY' | 'LUCKY' | 'POOR';
export type Posture = 'BALANCED' | 'OVER_COMMITTED' | 'OVER_CAUTIOUS';

// ---------- scenario (authoring model, after loader conversion minutes→seconds) ----------
export interface ScenarioMeta {
  id: string;                     // kebab-case, unique
  version: number;                // integer >= 1
  title: string;
  subtitle: string;
  synthetic: true;                // literal true — enforced by schema
  difficulty: 1 | 2 | 3 | 4 | 5;
  durationSec: SimSeconds;
  summary: string;                // <= 280 chars
  briefing: string[];             // paragraphs
  tags: string[];
}

export interface HypothesisDef {
  id: HypothesisId;
  label: string;                  // "Veer Pass is passable"
  trueLabel: string;              // "Passable"
  falseLabel: string;             // "Blocked"
  prior: number;                  // 0 < prior < 1
  primary: boolean;               // exactly one primary per scenario (used for estimate/calibration)
  initialTruth: boolean;          // hidden truth at t=0
}

export interface ChannelDef {
  id: ChannelId;
  label: string;                  // "Land patrols"
  sourceLabel: string;            // "Ground patrol net"
  tauSec: SimSeconds;             // age-decay time constant
  baseDelaySec: SimSeconds;
  visibleTo: RoleId[];            // roles that see this channel directly
}

export interface ReportDef {
  id: ReportId;                   // "R01"
  channel: ChannelId;
  hypothesisId: HypothesisId | null;   // null => informational only (stance must be 0)
  stance: Stance;
  claim: string;                  // <= 90 chars; shown as card title
  detail: string;                 // <= 400 chars; shown on inspection
  rho: number;                    // 0.5 < rho < 1
  evidenceGroup: EvidenceGroupId;
  issuedAtSec: SimSeconds;
}

// ---------- scenario events ----------
export type ScenarioEvent =
  | { kind: 'TRUTH_CHANGE'; atSec: SimSeconds; hypothesisId: HypothesisId; value: boolean }
  | { kind: 'CHANNEL_DEGRADE'; atSec: SimSeconds; channel: ChannelId; mode: Exclude<ChannelMode, 'HEALTHY'>; extraDelaySec?: SimSeconds; healthMultiplier?: number; untilSec: SimSeconds; note: string }
  | { kind: 'CHANNEL_RESTORE'; atSec: SimSeconds; channel: ChannelId }
  | { kind: 'REPORT_ISSUE'; atSec: SimSeconds; reportId: ReportId };   // atSec MUST equal ReportDef.issuedAtSec

export interface UtilityRule { when: Record<HypothesisId, boolean>; value: number }   // first matching rule wins; {} matches all

export interface ActionDef {
  id: ActionId;
  label: string;
  description: string;
  terminal: true;
  delayCostApplies: boolean;
  utility: UtilityRule[];
  consequences: { when: Record<HypothesisId, boolean>; headline: string; narrative: string; arrivalSec: SimSeconds }[];
}

export interface AssetDef {
  id: AssetId;
  label: string;
  channel: ChannelId;
  hypothesisId: HypothesisId;
  delaySec: SimSeconds;
  costUnits: number;
  rho: number;
  capacity: number;               // max uses per decision point
  resultClaims: { supports: string; contradicts: string };
}

export interface DecisionPointDef {
  id: string;
  title: string;
  prompt: string;
  openSec: SimSeconds;
  closeSec: SimSeconds;
  departureSec: SimSeconds;       // delay cost accrues after this
  delayCostPerMin: number;
  timeoutActionId: ActionId;
  actions: ActionDef[];
  assets: AssetId[];
  requiredEstimates: HypothesisId[];
}

export interface ScenarioDef {
  meta: ScenarioMeta;
  hypotheses: HypothesisDef[];
  channels: ChannelDef[];
  reports: ReportDef[];
  events: ScenarioEvent[];
  assets: AssetDef[];
  decisionPoints: DecisionPointDef[];
  outcomeScale: { min: number; max: number };            // for Outcome score normalization (flagship: -100..100)
  verifyOutcomeMode: 'TRUTH_CONSISTENT' | 'STOCHASTIC';
  injectPresets: InjectPresetDef[];
  scoreWeights: ScoreWeights;
  model: ModelParams;
}

export interface ModelParams {
  llrClamp: number;               // |log-odds| clamp, flagship 5
  contradictionMinNats: number;   // 0.5
  contradictionThreshold: number; // 0.5
  tieEpsilon: number;             // 0.05 expected-utility units
}

export interface ScoreWeights {
  decisionQuality: number; informationUtilization: number; outcome: number;
  timeliness: number; verificationEfficiency: number; calibration: number;   // MUST sum to 1.0 (flagship .40 .15 .15 .10 .15 .05)
}

export interface InjectPresetDef {
  id: string; label: string; description: string;
  effect:
    | { kind: 'DEGRADE'; channel: ChannelId; mode: Exclude<ChannelMode,'HEALTHY'>; extraDelaySec?: SimSeconds; durationSec: SimSeconds; healthMultiplier?: number }
    | { kind: 'RESTORE_ALL' }
    | { kind: 'FALSE_REPORT'; channel: ChannelId; hypothesisId: HypothesisId; stance: Stance; rho: number; claim: string; detail: string };
}

// ---------- runtime ----------
export interface ChannelRuntime {
  id: ChannelId; mode: ChannelMode; health: ChannelHealth;
  extraDelaySec: SimSeconds; healthMultiplier: number;   // 1 when healthy
  untilSec: SimSeconds | null; note: string | null;
  lastDeliveredAtSec: SimSeconds | null;
}

export interface ReportRuntime {
  def: ReportDef;                 // for injected/verify reports a synthesized def
  status: ReportStatus;
  deliveredAtSec: SimSeconds | null;      // null until scheduled; set at issue
  droppedReason: 'DROPOUT' | null;
  origin: 'SCENARIO' | 'INJECT' | 'VERIFY' | 'RELAY';
  relayedFrom?: { role: RoleId; atSec: SimSeconds; note?: string };
  sequence: number;               // creation order for stable sorting
  healthAtIssue: number;          // channel healthMultiplier at issue time (1 when healthy)
}

export interface EstimateRecord { atSec: SimSeconds; hypothesisId: HypothesisId; p: number; role: RoleId }
export interface InspectRecord { atSec: SimSeconds; reportId: ReportId; role: RoleId }
export interface VerificationRecord {
  id: string; assetId: AssetId; hypothesisId: HypothesisId; requestedAtSec: SimSeconds; deliversAtSec: SimSeconds;
  costUnits: number; resultReportId: ReportId; role: RoleId; decisionPointId: string;
}
export interface Rationale { text: string; citedReportIds: ReportId[]; tags: RationaleTag[] }
export type RationaleTag =
  | 'RELIED_ON_FRESH_REPORT' | 'DISCOUNTED_STALE_REPORT' | 'WEIGHED_CONTRADICTION'
  | 'PRIORITIZED_SAFETY' | 'PRIORITIZED_TIME' | 'AWAITED_VERIFICATION' | 'FOLLOWED_TEAM_ADVICE' | 'OTHER';

export interface DecisionRecord {
  decisionPointId: string; atSec: SimSeconds; actionId: ActionId; role: RoleId;
  timedOut: boolean; rationale: Rationale | null; estimates: Record<HypothesisId, number>;
  consultedAid: boolean;
}

export interface BeliefSnapshot {
  atSec: SimSeconds;
  perHypothesis: Record<HypothesisId, HypothesisBelief>;
  fogIndex: number;               // mean binary entropy in bits, 0..1
}
export interface HypothesisBelief {
  p: number; logOdds: number; entropyBits: number;
  contributions: EvidenceContribution[];     // one per evidence group (after group rule)
  positiveNats: number; negativeNats: number;
  contradictionIndex: number; contradicted: boolean;
}
export interface EvidenceContribution {
  reportId: ReportId; group: EvidenceGroupId; channel: ChannelId; stance: Stance;
  rho: number; ageSec: SimSeconds; effectiveAccuracy: number; llr: number;   // signed log-likelihood ratio in nats
  weight: number;                 // |llr| / max(|llr| over contributions at this time) — drives Fog Veil opacity
}

export interface SimState {
  scenarioId: string; scenarioVersion: number; seed: number; difficultyLevel: number;
  phase: Phase; nowSec: SimSeconds;
  channels: Record<ChannelId, ChannelRuntime>;
  reports: Record<ReportId, ReportRuntime>;
  truth: Record<HypothesisId, boolean>;                 // HIDDEN
  nextSequence: number;
  inspections: InspectRecord[];
  estimates: EstimateRecord[];
  verifications: VerificationRecord[];
  decisions: DecisionRecord[];
  currentDecisionPointIndex: number;
  consequenceRevealAtSec: SimSeconds | null;
  aidRevealedAtSec: SimSeconds | null;
  pausedAtSec: SimSeconds | null;
  relays: { fromRole: RoleId; reportId: ReportId; atSec: SimSeconds; relayReportId: ReportId; note?: string }[];
  advice: { role: RoleId; atSec: SimSeconds; actionId: ActionId; note?: string }[];
  aidMode: 'ALWAYS' | 'AFTER_ESTIMATE';
  processedEventCursor: number;                         // index into the sorted internal event list
  injectedCounter: number;
}

// ---------- intents (the ONLY way state changes besides time) ----------
export type Intent =
  | { type: 'START'; t: SimSeconds }
  | { type: 'PAUSE'; t: SimSeconds }
  | { type: 'RESUME'; t: SimSeconds }
  | { type: 'OPEN_REPORT'; t: SimSeconds; reportId: ReportId; role: RoleId }
  | { type: 'SET_ESTIMATE'; t: SimSeconds; hypothesisId: HypothesisId; p: number; role: RoleId }
  | { type: 'REVEAL_AID'; t: SimSeconds; role: RoleId }
  | { type: 'VERIFY'; t: SimSeconds; assetId: AssetId; role: RoleId }
  | { type: 'RELAY'; t: SimSeconds; reportId: ReportId; fromRole: RoleId; note?: string }
  | { type: 'ADVISE'; t: SimSeconds; role: RoleId; actionId: ActionId; note?: string }
  | { type: 'DECIDE'; t: SimSeconds; actionId: ActionId; role: RoleId; rationale: Rationale | null }
  | { type: 'INJECT'; t: SimSeconds; presetId: string; role: 'INSTRUCTOR' }
  | { type: 'RESET'; t: SimSeconds };

export interface SessionLog {
  logVersion: 1; scenarioId: string; scenarioVersion: number; scenarioHash: string;
  seed: number; difficultyLevel: number; aidMode: 'ALWAYS' | 'AFTER_ESTIMATE'; intents: Intent[];
}
```

13.1 Validation rules (enforced in `scenarioSchema.ts` + `scenarioLoader.ts` invariants):
- IDs unique within their collection. Every `ReportDef.id` appears in exactly one `REPORT_ISSUE` event whose `atSec === issuedAtSec`.
- Exactly one hypothesis has `primary: true`.
- `rho` strictly in (0.5, 1). `prior` strictly in (0, 1).
- `ReportDef.stance === 0` iff `hypothesisId === null`.
- All `CHANNEL_DEGRADE` events have a matching `CHANNEL_RESTORE` at `untilSec` (the loader MUST auto-insert the restore event; authors do not write restores).
- `closeSec > openSec`; `timeoutActionId` is one of the DP's actions; `departureSec >= 0`.
- Each action's `utility` rules cover every joint truth state (loader enumerates 2^k states and asserts a rule matches; k ≤ 6).
- Weights sum to 1.0 ± 1e-9. `synthetic` is literal `true`.
- Every `consequences[].when` set covers every joint state for that action (loader asserts).
- `durationSec >= max(closeSec, max consequence arrival) + 60`.

---

## 14. PERSISTENCE AND DATA MODEL (no database)

### 14.1 Decision
No SQL/NoSQL database and no authentication. Rationale: a judge-facing prototype gains no visible value from accounts; every account system adds failure modes. Persistence is (a) in-memory on the server with TTL, (b) `localStorage` on the client for history. This is final.

### 14.2 Server in-memory model (`server/sessions.ts`)
```ts
interface Session {
  code: string;                       // 6 chars from 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  createdAtMs: number; lastActivityMs: number;
  scenarioId: string; seed: number; difficultyLevel: number; aidMode: 'ALWAYS'|'AFTER_ESTIMATE';
  state: SimState; scenario: ScenarioDef; log: SessionLog;
  speedSecPerMin: number;             // wall seconds per simulated minute; default 4
  clients: Map<string, ClientConn>;   // key = clientId
  seq: number;                        // monotonically increasing per applied change
  finished: boolean;
}
interface ClientConn { clientId: string; token: string; role: RoleId; name: string; ws: WebSocket | null; connectedAtMs: number; lastSeenMs: number }
```
- TTL: delete sessions idle for `SESSION_TTL_MINUTES` (default 360). Sweep every 60 s. `MAX_SESSIONS` default 50; creation beyond limit returns `429`.
- Role capacity: exactly 1 INSTRUCTOR, 1 COMMANDER, 1 ANALYST. A second join for a taken role gets `ROLE_TAKEN`.

### 14.3 Client `localStorage` keys (`src/utils/storage.ts`; every read wrapped in try/catch + zod validation; failures fall back to defaults)
| Key | Content | Max |
|---|---|---|
| `dhundh.v1.history` | `SessionSummary[]` (newest first) | 50 entries |
| `dhundh.v1.logs` | `{ [summaryId]: SessionLog }` — only last 20 | 20 logs (~12 KB each) |
| `dhundh.v1.difficulty` | `{ [scenarioId]: { level: 1..5; lastReason: string } }` | — |
| `dhundh.v1.settings` | `{ reducedMotion: boolean|null; aidMode: 'ALWAYS'|'AFTER_ESTIMATE'; speedSecPerMin: number; showHints: boolean }` | — |
| `dhundh.v1.clientId` | UUID for reconnect | — |

```ts
export interface SessionSummary {
  id: string;                         // crypto.randomUUID()
  scenarioId: string; scenarioVersion: number; seed: number; difficultyLevel: number;
  completedAtIso: string;
  actionId: string; quadrant: Quadrant; trainingScore: number;
  dq: number; outcome: number; infoUtil: number; timeliness: number; verifyEff: number; calibration: number;
  estimateP: number | null; systemP: number | null;      // primary hypothesis, for the reliability table
  truthPrimary: boolean; verified: boolean; posture: Posture;
}
```
- Storage quota failure: drop oldest logs first; show a non-blocking toast "History storage full — oldest logs removed".

### 14.4 Data labelling (`SYNTHETIC` rule)
Every `ScenarioDef.meta.synthetic` is `true`. Exports MUST include `"dataProvenance": "SYNTHETIC SCENARIO — fictional entities; reliabilities and utilities are authoring assumptions"`.

---

## 15. SCENARIO SCHEMA (CREATE `src/engine/scenarioSchema.ts` using zod)

15.1 Mirror Section 13 types exactly with zod objects. Use `z.strictObject` everywhere (unknown keys fail). Use these refinements:
```ts
const rho = z.number().gt(0.5).lt(1);
const prob = z.number().gt(0).lt(1);
const secFromMin = z.number().min(0);           // authors write minutes in JSON as *Min fields
```
15.2 JSON authoring format differs from the runtime model ONLY by unit: JSON uses `...Min` fields (minutes, may be fractional to 0.5); `scenarioLoader.ts` converts to `...Sec` integers. Mapping:
| JSON field | Runtime field |
|---|---|
| `tauMin`, `baseDelayMin` | `tauSec`, `baseDelaySec` |
| `issuedAtMin` | `issuedAtSec` |
| `atMin`, `untilMin`, `extraDelayMin`, `durationMin` | `atSec`, `untilSec`, `extraDelaySec`, `durationSec` |
| `openMin`, `closeMin`, `departureMin` | `openSec`, `closeSec`, `departureSec` |
| `arrivalMin` (consequences), `delayMin` (assets) | `arrivalSec`, `delaySec` |
15.3 `scenarioLoader.ts` exports:
```ts
export function loadScenario(raw: unknown): ScenarioDef          // throws ScenarioValidationError with path list
export function scenarioHash(def: ScenarioDef): string           // FNV-1a 32-bit hex over canonical JSON
export function enumerateStates(hyps: HypothesisDef[]): Record<HypothesisId, boolean>[]
```
15.4 `scripts/validate-scenarios.ts` MUST load every file in `src/scenarios/*.json`, print `OK <id> v<version> hash=<hash>` per scenario, and exit 1 on any failure. `npm run build` MUST NOT proceed if validation fails: add `"prebuild": "npm run validate:scenarios"`.

---

## 16. EVENT MODEL

### 16.1 Internal event record (built by `simulation.ts: buildEventTimeline`)
```ts
interface InternalEvent { atSec: number; priority: number; order: number; kind: 'TRUTH_CHANGE'|'CHANNEL_DEGRADE'|'CHANNEL_RESTORE'|'REPORT_ISSUE'|'REPORT_DELIVER'|'DECISION_OPEN'|'DECISION_CLOSE'|'CONSEQUENCE_REVEAL'; payload: unknown }
```
### 16.2 Ordering (total order, deterministic)
Sort key: `(atSec ASC, priority ASC, order ASC)` where `order` is insertion index.
| priority | kind |
|---|---|
| 0 | TRUTH_CHANGE |
| 1 | CHANNEL_RESTORE |
| 2 | CHANNEL_DEGRADE |
| 3 | REPORT_ISSUE |
| 4 | REPORT_DELIVER |
| 5 | DECISION_OPEN |
| 6 | DECISION_CLOSE (timeout) |
| 7 | CONSEQUENCE_REVEAL |
Intents at time `t` are applied AFTER all internal events with `atSec <= t`. Therefore a report delivered at exactly `t` IS visible to a decision at `t`; a decision-window close at `t` fires BEFORE an intent at `t` (so a DECIDE at exactly `closeSec` is rejected as `WINDOW_CLOSED`; the last valid decision time is `closeSec - 1`).
### 16.3 Dynamic events
`REPORT_DELIVER`, `DECISION_CLOSE`, `CONSEQUENCE_REVEAL` and verification deliveries are inserted into the timeline at runtime by the engine (insertion keeps the sort invariant; use binary insertion). Injected presets (`INJECT` intent) insert `CHANNEL_DEGRADE`/`CHANNEL_RESTORE`/`REPORT_ISSUE` events at the intent time `t` (priority ordering applies; they are processed in the same `advanceTo(t)` call).
### 16.4 Event log
Every processed event appends `{ atSec, kind, summary }` to an append-only `engineLog` held OUTSIDE `SimState` (returned by `advanceTo` as `effects`). The AAR timeline is built from `SessionLog` replay, not from `engineLog` persisted state, to avoid divergence.

---

## 17. STATE MACHINE

### 17.1 Phases and transitions
| From | Trigger (guard) | To | Side effects |
|---|---|---|---|
| IDLE | `START` (t = 0) | RUNNING | Build timeline; set `nowSec=0`; initial truth from hypotheses |
| RUNNING | `PAUSE` | PAUSED | `pausedAtSec = t` |
| PAUSED | `RESUME` | RUNNING | `pausedAtSec = null` (sim time does not advance during pause) |
| RUNNING | `DECIDE` valid for current DP (window open, required estimates present) and it is the LAST DP | CONSEQUENCE | Record decision; compute `consequenceRevealAtSec = t + action.arrivalSec(truth)` |
| RUNNING | `DECIDE` valid and NOT the last DP | RUNNING | Record decision; advance `currentDecisionPointIndex` |
| RUNNING | DECISION_CLOSE with no decision | CONSEQUENCE (if last DP) / RUNNING | Auto-record timeout decision with `timeoutActionId`, `timedOut=true` |
| CONSEQUENCE | CONSEQUENCE_REVEAL event | COMPLETE | Truth becomes visible in views |
| any | `RESET` | IDLE | Fresh state from scenario/seed |
17.2 Guards for `DECIDE`: phase RUNNING; current DP `openSec <= t < closeSec`; `requiredEstimates` all present in `estimates` with `atSec <= t`; role permitted (SOLO or COMMANDER). Violations return `{ ok: false, error: ENGINE_ERROR_CODE }`; they never throw and never mutate state.
17.3 Error codes (`engine/types.ts`): `NOT_RUNNING`, `WINDOW_NOT_OPEN`, `WINDOW_CLOSED`, `ESTIMATE_REQUIRED`, `ROLE_FORBIDDEN`, `UNKNOWN_REPORT`, `REPORT_NOT_DELIVERED`, `UNKNOWN_ACTION`, `UNKNOWN_ASSET`, `ASSET_EXHAUSTED`, `VERIFY_TOO_LATE`, `INVALID_ESTIMATE`, `UNKNOWN_PRESET`, `RELAY_LIMIT`, `RELAY_FORBIDDEN`, `ADVICE_FORBIDDEN`.
17.3a Intent permission matrix (enforced in the engine and repeated on the server): `START`, `PAUSE`, `RESUME`, and `RESET` are allowed only to `SOLO` in local mode or `INSTRUCTOR` in instructor/networked mode; `OPEN_REPORT`, `SET_ESTIMATE`, `VERIFY`, and `DECIDE` are allowed to `SOLO` or `COMMANDER`; `RELAY` and `ADVISE` are allowed only to `ANALYST`; `INJECT` is allowed only to `INSTRUCTOR`. A network client MUST never be able to self-upgrade into `INSTRUCTOR` merely by declaring that role.
17.4 Rollback/replay rule: there is no rollback. Undo is performed by replay: `replay(log, upToIntentIndex)` rebuilds state from scratch. The engine is pure; replay cost ≤ 100 ms.
17.5 Pause semantics: while PAUSED the clock does not advance; intents other than `RESUME`, `RESET`, `INJECT` (instructor) are rejected with `NOT_RUNNING`. (INSTRUCTOR injects while paused are applied at the frozen `nowSec`.)

---

## 18. FLAGSHIP SCENARIO AND GOLDEN DEMO TEST (`FLAGSHIP_DEMO`)

### 18.1 Fiction (MUST remain fictional and non-operational)
A relief convoy (call sign KESTREL-1) at Camp Alder must reach Distribution Point Marigold before a weather window closes. Two routes: **north via Veer Pass** (short, high payoff) or **south via Tamsa Ford** (long, lower payoff). A hidden landslide blocks Veer Pass at t = 14:00. From t = 16:00 wideband interference degrades the LAND link (delay) and from t = 18:00 the AIR link drops out. The commander must choose before t = 30:00 and may task one verification asset. There are no adversaries, weapons, targeting, or tactics: the decision is route selection under uncertain information, which is the training variable.

### 18.2 CREATE `src/scenarios/kestrel-relief-corridor.json` (exact content)

```json
{
  "meta": {
    "id": "kestrel-relief-corridor",
    "version": 1,
    "title": "Relief Corridor KESTREL",
    "subtitle": "Choose a route while the picture dissolves",
    "synthetic": true,
    "difficulty": 3,
    "durationMin": 36,
    "summary": "A relief convoy must pick the north pass or the south ford while interference delays, drops, and contradicts the reports that describe both routes.",
    "briefing": [
      "Convoy KESTREL-1 is staged at Camp Alder with time-critical relief supplies for Distribution Point Marigold. A weather window closes at 30:00 scenario time.",
      "Two routes exist. The north route through Veer Pass is short and pays off most, but a blocked pass would strand the convoy. The south route through Tamsa Ford is longer and pays off less, but is usually passable.",
      "Four information sources feed you: land patrols, aerial survey, sensor telemetry, and spectrum monitoring. Expect delays, gaps, and contradictions.",
      "You may task one verification asset per route. Verification takes time and costs resources. Waiting also costs: every minute after 12:00 reduces the value of moving at all.",
      "This is a synthetic training scenario. Entities, reliabilities, and payoffs are authoring assumptions and do not represent any real operation or doctrine."
    ],
    "tags": ["land", "air", "cyber", "ew", "route-choice"]
  },
  "hypotheses": [
    { "id": "north_pass", "label": "Veer Pass (north route) is passable", "trueLabel": "Passable", "falseLabel": "Blocked", "prior": 0.7, "primary": true, "initialTruth": true },
    { "id": "south_ford", "label": "Tamsa Ford (south route) is passable", "trueLabel": "Passable", "falseLabel": "Blocked", "prior": 0.8, "primary": false, "initialTruth": true }
  ],
  "channels": [
    { "id": "LAND",  "label": "Land patrols",     "sourceLabel": "Ground patrol net",        "tauMin": 20, "baseDelayMin": 0, "visibleTo": ["SOLO", "COMMANDER", "INSTRUCTOR"] },
    { "id": "AIR",   "label": "Aerial survey",    "sourceLabel": "Aerial survey relay",      "tauMin": 15, "baseDelayMin": 0, "visibleTo": ["SOLO", "COMMANDER", "INSTRUCTOR"] },
    { "id": "CYBER", "label": "Sensor telemetry", "sourceLabel": "Pass sensor mesh",         "tauMin": 25, "baseDelayMin": 0, "visibleTo": ["SOLO", "ANALYST", "INSTRUCTOR"] },
    { "id": "EW",    "label": "Spectrum monitor", "sourceLabel": "Spectrum monitoring cell", "tauMin": 30, "baseDelayMin": 0, "visibleTo": ["SOLO", "ANALYST", "INSTRUCTOR"] }
  ],
  "reports": [
    { "id": "R01", "channel": "LAND",  "hypothesisId": "north_pass", "stance": 1,  "rho": 0.85, "evidenceGroup": "G1",  "issuedAtMin": 3,
      "claim": "Checkpoint Alder: Veer Pass road open, no obstruction",
      "detail": "Ground patrol reports the road surface at the Veer Pass entrance is clear and traffic is moving normally." },
    { "id": "R02", "channel": "AIR",   "hypothesisId": "north_pass", "stance": 1,  "rho": 0.80, "evidenceGroup": "G2",  "issuedAtMin": 5,
      "claim": "Aerial survey: Veer Pass visible and clear",
      "detail": "Survey flight over the northern corridor shows no debris on the pass road. Imagery resolution is adequate." },
    { "id": "R03", "channel": "LAND",  "hypothesisId": "south_ford", "stance": 1,  "rho": 0.85, "evidenceGroup": "G3",  "issuedAtMin": 6,
      "claim": "Tamsa Ford crossing passable, water level normal",
      "detail": "Patrol crossed the ford this morning without difficulty. Water level is within the normal range." },
    { "id": "R04", "channel": "CYBER", "hypothesisId": "north_pass", "stance": 1,  "rho": 0.65, "evidenceGroup": "G4",  "issuedAtMin": 8,
      "claim": "Pass sensor mesh: all nodes nominal",
      "detail": "Roadside vibration and tilt sensors report nominal readings. Sensors can fail silently, so this is weaker evidence than direct observation." },
    { "id": "R08", "channel": "EW",    "hypothesisId": null,         "stance": 0,  "rho": 0.70, "evidenceGroup": "G8",  "issuedAtMin": 16,
      "claim": "Wideband interference detected near Veer Pass",
      "detail": "Spectrum monitoring detects wideband interference in the pass vicinity. Land and aerial links may be degraded or delayed." },
    { "id": "R05", "channel": "CYBER", "hypothesisId": "north_pass", "stance": -1, "rho": 0.60, "evidenceGroup": "G5",  "issuedAtMin": 17,
      "claim": "Pass sensor mesh: telemetry frozen, integrity flag raised",
      "detail": "Several sensor nodes report identical readings for four minutes. Frozen telemetry can indicate sensor failure, tampering, or physical damage to the node." },
    { "id": "R06", "channel": "LAND",  "hypothesisId": "north_pass", "stance": -1, "rho": 0.75, "evidenceGroup": "G6",  "issuedAtMin": 16,
      "claim": "Patrol: rockfall observed near Veer Pass entrance",
      "detail": "A patrol vehicle saw fresh rockfall near the pass entrance and turned back before reaching it. The report was queued while the link was degraded." },
    { "id": "R10", "channel": "AIR",   "hypothesisId": "north_pass", "stance": -1, "rho": 0.85, "evidenceGroup": "G10", "issuedAtMin": 20,
      "claim": "Aerial survey: debris field across Veer Pass road",
      "detail": "Survey imagery shows a debris field blocking the road at the pass entrance." },
    { "id": "R09", "channel": "LAND",  "hypothesisId": "south_ford", "stance": -1, "rho": 0.60, "evidenceGroup": "G9",  "issuedAtMin": 21,
      "claim": "Patrol: Tamsa Ford water level rising",
      "detail": "Upstream rain is raising the water level at the ford. Crossing remains possible but margins are shrinking." },
    { "id": "R07", "channel": "AIR",   "hypothesisId": "north_pass", "stance": 1,  "rho": 0.62, "evidenceGroup": "G7",  "issuedAtMin": 24,
      "claim": "Aerial relay: pass appears clear (partial imagery, cloud cover)",
      "detail": "Link restored. Imagery is partly obscured by cloud; the visible sections of the pass road look clear. Coverage of the pass entrance is incomplete." },
    { "id": "R11", "channel": "LAND",  "hypothesisId": "north_pass", "stance": -1, "rho": 0.90, "evidenceGroup": "G11", "issuedAtMin": 25,
      "claim": "Checkpoint Alder: debris confirmed covering Veer Pass road",
      "detail": "Direct confirmation from the patrol that reached the entrance. Delivered late because of link delay." }
  ],
  "events": [
    { "kind": "TRUTH_CHANGE", "atMin": 14, "hypothesisId": "north_pass", "value": false },
    { "kind": "CHANNEL_DEGRADE", "atMin": 16, "channel": "LAND", "mode": "DELAY", "extraDelayMin": 6, "untilMin": 26, "note": "Wideband interference on the patrol net: messages delayed" },
    { "kind": "CHANNEL_DEGRADE", "atMin": 18, "channel": "AIR",  "mode": "DROPOUT", "untilMin": 24, "note": "Aerial relay link lost: messages not delivered" },
    { "kind": "REPORT_ISSUE", "atMin": 3,  "reportId": "R01" },
    { "kind": "REPORT_ISSUE", "atMin": 5,  "reportId": "R02" },
    { "kind": "REPORT_ISSUE", "atMin": 6,  "reportId": "R03" },
    { "kind": "REPORT_ISSUE", "atMin": 8,  "reportId": "R04" },
    { "kind": "REPORT_ISSUE", "atMin": 16, "reportId": "R08" },
    { "kind": "REPORT_ISSUE", "atMin": 17, "reportId": "R05" },
    { "kind": "REPORT_ISSUE", "atMin": 16, "reportId": "R06" },
    { "kind": "REPORT_ISSUE", "atMin": 20, "reportId": "R10" },
    { "kind": "REPORT_ISSUE", "atMin": 21, "reportId": "R09" },
    { "kind": "REPORT_ISSUE", "atMin": 24, "reportId": "R07" },
    { "kind": "REPORT_ISSUE", "atMin": 25, "reportId": "R11" }
  ],
  "assets": [
    { "id": "UAV_SORTIE", "label": "Aerial recon sortie (Veer Pass)", "channel": "AIR", "hypothesisId": "north_pass",
      "delayMin": 6, "costUnits": 5, "rho": 0.95, "capacity": 1,
      "resultClaims": { "supports": "Sortie confirms Veer Pass clear", "contradicts": "Sortie confirms Veer Pass blocked by debris" } },
    { "id": "FORD_GAUGE", "label": "Ford gauge check (Tamsa Ford)", "channel": "LAND", "hypothesisId": "south_ford",
      "delayMin": 5, "costUnits": 3, "rho": 0.90, "capacity": 1,
      "resultClaims": { "supports": "Gauge check confirms Tamsa Ford passable", "contradicts": "Gauge check confirms Tamsa Ford impassable" } }
  ],
  "decisionPoints": [
    {
      "id": "DP1",
      "title": "Select the convoy route",
      "prompt": "Commit KESTREL-1 to a route, or stand down. The window closes at 30:00.",
      "openMin": 12, "closeMin": 30, "departureMin": 12, "delayCostPerMin": 1.5,
      "timeoutActionId": "STAND_DOWN",
      "assets": ["UAV_SORTIE", "FORD_GAUGE"],
      "requiredEstimates": ["north_pass"],
      "actions": [
        { "id": "GO_NORTH", "label": "Take the north route (Veer Pass)", "description": "Short route. High payoff if passable; convoy stranded if blocked.",
          "terminal": true, "delayCostApplies": true,
          "utility": [ { "when": { "north_pass": true }, "value": 100 }, { "when": { "north_pass": false }, "value": -80 } ],
          "consequences": [
            { "when": { "north_pass": true },  "headline": "Convoy clears Veer Pass", "narrative": "KESTREL-1 passes the pass without incident and reaches Marigold inside the window.", "arrivalMin": 5 },
            { "when": { "north_pass": false }, "headline": "Convoy halted at the Veer Pass debris field", "narrative": "KESTREL-1 stops at the debris field. Recovery and re-routing exhaust the weather window.", "arrivalMin": 4 }
          ] },
        { "id": "GO_SOUTH", "label": "Take the south route (Tamsa Ford)", "description": "Long route. Moderate payoff if passable; convoy stranded if impassable.",
          "terminal": true, "delayCostApplies": true,
          "utility": [ { "when": { "south_ford": true }, "value": 70 }, { "when": { "south_ford": false }, "value": -80 } ],
          "consequences": [
            { "when": { "south_ford": true },  "headline": "Convoy crosses Tamsa Ford", "narrative": "KESTREL-1 crosses the ford with reduced margin and reaches Marigold inside the window.", "arrivalMin": 7 },
            { "when": { "south_ford": false }, "headline": "Convoy halted at Tamsa Ford", "narrative": "Rising water prevents the crossing and the weather window is lost.", "arrivalMin": 6 }
          ] },
        { "id": "STAND_DOWN", "label": "Stand down at Camp Alder", "description": "Hold the convoy. Safe, but the mission is deferred.",
          "terminal": true, "delayCostApplies": false,
          "utility": [ { "when": {}, "value": 10 } ],
          "consequences": [
            { "when": {}, "headline": "Convoy holds at Camp Alder", "narrative": "KESTREL-1 stays in place and the relief delivery is deferred to the next window.", "arrivalMin": 3 }
          ] }
      ]
    }
  ],
  "outcomeScale": { "min": -100, "max": 100 },
  "verifyOutcomeMode": "TRUTH_CONSISTENT",
  "injectPresets": [
    { "id": "JAM_LAND", "label": "Jam LAND link", "description": "Delay land patrol reports by 6 minutes for 10 minutes",
      "effect": { "kind": "DEGRADE", "channel": "LAND", "mode": "DELAY", "extraDelayMin": 6, "durationMin": 10 } },
    { "id": "DROP_AIR", "label": "Drop AIR link", "description": "Drop all aerial reports for 6 minutes",
      "effect": { "kind": "DEGRADE", "channel": "AIR", "mode": "DROPOUT", "durationMin": 6 } },
    { "id": "NOISE_CYBER", "label": "Degrade CYBER telemetry", "description": "Halve the effective reliability of sensor telemetry for 8 minutes",
      "effect": { "kind": "DEGRADE", "channel": "CYBER", "mode": "NOISE", "healthMultiplier": 0.5, "durationMin": 8 } },
    { "id": "FALSE_NORTH_CLEAR", "label": "Inject conflicting report", "description": "Insert an unconfirmed relay claiming Veer Pass is clear",
      "effect": { "kind": "FALSE_REPORT", "channel": "LAND", "hypothesisId": "north_pass", "stance": 1, "rho": 0.70,
        "claim": "Patrol relay: Veer Pass reported clear (unconfirmed)", "detail": "Second-hand relay of an earlier observation; origin unclear." } },
    { "id": "RESTORE_ALL", "label": "Restore all links", "description": "Return every channel to healthy",
      "effect": { "kind": "RESTORE_ALL" } }
  ],
  "scoreWeights": { "decisionQuality": 0.40, "informationUtilization": 0.15, "outcome": 0.15, "timeliness": 0.10, "verificationEfficiency": 0.15, "calibration": 0.05 },
  "model": { "llrClamp": 5, "contradictionMinNats": 0.5, "contradictionThreshold": 0.5, "tieEpsilon": 0.05 }
}
```

18.2.1 JSON authoring notes (loader MUST honour): consequence `when` rules are partial maps evaluated first-match; `{}` matches all; the loader asserts that every joint truth state matches some rule for every action's `utility` AND `consequences`. `GO_NORTH` utility ignores `south_ford`, so partial `when` objects are intended.
18.2.2 Verification assets use dedicated tasking links: their results are NOT affected by routine channel degradation (documented in the reference-model drawer).
18.2.3 `R08` is informational (`hypothesisId: null`, `stance: 0`): it contributes no log-odds but updates the Channel Health Strip narrative and the AAR "interference detected" annotation.

### 18.3 Expected channel behaviour for the flagship (acceptance fixture; `tests/golden/flagship.expected.ts`)

| Report | Channel | Issued | Delivered | Status |
|---|---|---|---|---|
| R01 | LAND | 03:00 | 03:00 | DELIVERED |
| R02 | AIR | 05:00 | 05:00 | DELIVERED |
| R03 | LAND | 06:00 | 06:00 | DELIVERED |
| R04 | CYBER | 08:00 | 08:00 | DELIVERED |
| R08 | EW | 16:00 | 16:00 | DELIVERED |
| R06 | LAND | 16:00 | 22:00 | DELIVERED (delay +6:00) |
| R05 | CYBER | 17:00 | 17:00 | DELIVERED |
| R10 | AIR | 20:00 | — | DROPPED (AIR dropout 18:00–24:00) |
| R09 | LAND | 21:00 | 27:00 | DELIVERED (delay +6:00) |
| R07 | AIR | 24:00 | 24:00 | DELIVERED (restore processed before issue at 24:00) |
| R11 | LAND | 25:00 | 31:00 | DELIVERED after the decision window closes |

### 18.4 Golden belief table (SOLO view, no verification). Tolerance ±0.0005 on probabilities, ±0.0005 on bits.

| t (min) | p(north) | p(south) | H(north) bits | H(south) bits | Fog Index | N: +nats | N: −nats | Contradiction idx | Flag |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 0.9682 | 0.9365 | 0.2033 | 0.3413 | 0.2723 | 2.5691 | 0.0000 | 0.0000 | no |
| 16 | 0.9340 | 0.9083 | 0.3509 | 0.4422 | 0.3965 | 1.8022 | 0.0000 | 0.0000 | no |
| 20 | 0.8733 | 0.8920 | 0.5483 | 0.4937 | 0.5210 | 1.4417 | 0.3586 | 0.3983 | no |
| 22 | 0.7372 | 0.8847 | 0.8309 | 0.5158 | 0.6733 | 1.2927 | 1.1083 | 0.9232 | YES |
| 24 | 0.8169 | 0.8778 | 0.6868 | 0.5357 | 0.6112 | 1.6501 | 1.0019 | 0.7556 | YES |
| 26 | 0.8037 | 0.8714 | 0.7145 | 0.5537 | 0.6341 | 1.4695 | 0.9071 | 0.7634 | YES |
| 27 | 0.7976 | 0.8303 | 0.7268 | 0.6570 | 0.6919 | 1.3873 | 0.8636 | 0.7673 | YES |
| 28 | 0.7917 | 0.8288 | 0.7382 | 0.6604 | 0.6993 | 1.3102 | 0.8223 | 0.7712 | YES |
| 29 | 0.7861 | 0.8274 | 0.7488 | 0.6636 | 0.7062 | 1.2376 | 0.7832 | 0.7751 | YES |
| 30 | 0.7808 | 0.8261 | 0.7586 | 0.6666 | 0.7126 | 1.1694 | 0.7461 | 0.7790 | YES |

With the UAV sortie result `V01` delivered at 28:00 (tasked at 22:00): p(north) = 0.1667 (t=28), 0.2398 (t=29), 0.2974 (t=30); p(south) unchanged from the table; Fog Index 0.6552 (28), 0.7291 (29), 0.7723 (30). `V01` contribution (llr) = −2.9444 (t=28), −2.4557 (t=29).

Contributions at t = 22 (north): R01 +0.5553, R02 +0.3913, R04 +0.3461, R05 −0.3305, R06 −0.7778. (south): R03 +0.6511.

### 18.5 Golden decision metrics (reward function; delay cost 1.5/min after 12:00; GO actions only)

| Quantity | Value |
|---|---|
| Expected utilities at t=22: GO_NORTH / GO_SOUTH / STAND_DOWN | 37.70 / 37.70 / 10.00 (tie within epsilon → `isTie = true`) |
| EVPI at t=22 | 38.05 |
| EVSI (UAV, ρ=0.95) at t=22 (decision utilities evaluated at t=22) | 31.38 |
| Net VOI at t=22 = EVSI − 1.5×6 − 5 | 17.38 |
| EVSI (FORD_GAUGE, ρ=0.90) at t=22 | 12.24 |
| Expected utilities at t=24 | 49.04 / 33.67 / 10.00; EVPI 26.53; EVSI 20.93; net VOI 6.93 |
| Expected utilities at t=26 | 43.67 / 29.71 / 10.00; EVPI 28.46 |
| Hidden-truth realized utilities | `north_pass=false`, `south_ford=true` |

### 18.6 Golden paths (each is a test in `tests/golden/flagship.test.ts`)

All intents use minutes→seconds. Tolerance: ±0.005 on unit-interval metrics, ±0.05 on utilities, ±0.1 on composite.

**Path A — "Verify then reroute" (the demo path)**
Intents: START 0; OPEN_REPORT R01..R04 at t=9; SET_ESTIMATE north_pass p=0.80 at t=18; OPEN_REPORT R05 at 18, R06 at 22; VERIFY UAV_SORTIE at 22; OPEN_REPORT R07 at 24; SET_ESTIMATE north_pass p=0.25 at 29 (after V01 delivered at 28); OPEN_REPORT V01 at 28; DECIDE GO_SOUTH at 29 with rationale citing R06, V01.

| Metric | Expected |
|---|---|
| Belief at decision (north) / a* | 0.2398 / GO_SOUTH |
| EU at decision | GO_NORTH −62.34, GO_SOUTH 18.61, STAND_DOWN 10.00 |
| Regret under belief R_t / R_max | 0.00 / 80.95 |
| Decision quality (DQ) | 1.0000 |
| Realized utility | 70 − 1.5×17 − 5 = **39.50**; Outcome = (39.5+100)/200 = **0.6975** |
| Information utilization | 0.9481 (opened weight 4.927 of 5.197; R09 delivered at 27 not opened) |
| Latency / Timeliness | (29−12)−6 = 11 min effective → 1 − 11/18 = **0.3889** |
| Verification efficiency | net VOI at tasking = 17.38 ≥ 0 → VE = **1.0000** |
| Calibration alignment | 1 − min(1, \|0.25 − 0.2398\|/0.5) = **0.9795** |
| Training Score | **88.47** |
| Quadrant | SOUND_SUCCESS (DQ ≥ 0.8 and Outcome ≥ 0.6) — see 24.7 thresholds |
| Posture | BALANCED |

**Path B — "Committed into the fog" (sound but unlucky, missed verification)**
Intents: START; OPEN R01,R02,R03,R04 at 9; OPEN R05 at 18; OPEN R07 at 24; SET_ESTIMATE north_pass 0.90 at 25; DECIDE GO_NORTH at 26 (no verification, R06 never opened).

| Metric | Expected |
|---|---|
| Belief at decision (north) / a* | 0.8037 / GO_NORTH |
| EU | 43.67 / 29.71 / 10.00 |
| DQ | **1.0000** (GO_NORTH is the highest expected-value action under belief) |
| Realized utility | −80 − 1.5×14 = −101.00 → Outcome **0.0000** (clipped) |
| Information utilization | 0.7843 |
| Timeliness | 1 − 14/18 = 0.2222 |
| Verification efficiency | not verified; evaluated at t_eval = min(26, 30−6=24) = 24: net VOI 6.93, EVPI 26.53 → VE = 1 − 6.93/26.53 = **0.7388** |
| Calibration alignment | 1 − \|0.90−0.8037\|/0.5 = 0.8074 |
| Training Score | **69.11** |
| Quadrant | SOUND_UNLUCKY |
| Required AAR statements | "R10 was dropped at 20:00; had it been delivered at 20:00 p(north) would have been 0.5488 instead of 0.8733." "R06 (rockfall) arrived at 22:00 and was not opened." "A verification sortie tasked at or before 24:00 was worth +6.93 net." |

**Path C — "Early commitment" (sound but unlucky, before the fog)**
Intents: START; OPEN R01..R04 at 9; SET_ESTIMATE north_pass 0.95 at 15; DECIDE GO_NORTH at 16.
Belief 0.9340; DQ 1.0000; realized −80 − 1.5×4 = −86.00 → Outcome 0.0700; Timeliness 1 − 4/18 = 0.7778; IU 1.0000; VE 1.0000 (net VOI −7.50 < 0, no value left on the table); Calibration 0.9680; Training Score **83.67**; quadrant SOUND_UNLUCKY.

**Path D — "Over-cautious"**
Intents: START; OPEN R01..R07 (as delivered) by 28; SET_ESTIMATE north_pass 0.50 at 27; DECIDE STAND_DOWN at 28.
Belief 0.7917; a* = GO_NORTH; regret 28.51 = R_max → DQ **0.0000**; realized utility 10 → Outcome 0.5500; IU 0.9018; Timeliness 1 − 16/18 = 0.1111; VE 0.7388 (evaluated at t_eval = 24); Calibration 0.4166; Training Score **36.05**; posture OVER_CAUTIOUS; quadrant POOR (DQ 0.00 < 0.8 and Outcome 0.55 < 0.6; see 24.7).

**Path E — "Timeout"**: START; no decision; at 30:00 the engine auto-records `STAND_DOWN` with `timedOut = true`; Outcome computed from utility 10; Timeliness = 0; AAR states "Decision window expired".

**Path F — determinism**: run Path A twice, JSON-serialize `SimState`, assert byte equality. Run Path A with a different seed: flagship has no stochastic elements; results MUST be identical.

---

## 19. SIMULATION ENGINE (`src/engine/simulation.ts`)

### 19.1 Public API (exact signatures)
```ts
export interface EngineResult<T = void> { ok: true; value: T; effects: EngineEffect[] } | { ok: false; error: EngineErrorCode; message: string }
export type EngineEffect =
  | { kind: 'REPORT_DELIVERED'; reportId: ReportId; atSec: SimSeconds }
  | { kind: 'REPORT_DROPPED'; reportId: ReportId; atSec: SimSeconds }
  | { kind: 'CHANNEL_CHANGED'; channel: ChannelId; atSec: SimSeconds }
  | { kind: 'TRUTH_CHANGED'; atSec: SimSeconds }            // never forwarded to trainee views
  | { kind: 'DECISION_WINDOW_OPENED' | 'DECISION_WINDOW_CLOSED'; decisionPointId: string; atSec: SimSeconds }
  | { kind: 'PHASE_CHANGED'; phase: Phase; atSec: SimSeconds };

export function createSession(scenario: ScenarioDef, opts: { seed: number; difficultyLevel: number; aidMode: 'ALWAYS' | 'AFTER_ESTIMATE' }): SimState;
export function advanceTo(state: SimState, scenario: ScenarioDef, tSec: SimSeconds): { state: SimState; effects: EngineEffect[] };
export function applyIntent(state: SimState, scenario: ScenarioDef, intent: Intent): { state: SimState; result: EngineResult };
export function replayLog(scenario: ScenarioDef, log: SessionLog, opts?: { upToSec?: SimSeconds; upToIntentIndex?: number }): SimState;
```
19.2 `advanceTo` MUST be pure: it returns a NEW state object (structural sharing allowed; use `structuredClone` on write paths — the state is small) and never reads `Date`, `Math.random`, or globals.
19.3 `advanceTo` rejects `tSec < state.nowSec` by returning the same state (monotonic time). In PAUSED phase it returns the same state unchanged.
19.4 `applyIntent` ALWAYS first calls `advanceTo(state, scenario, intent.t)` (except `RESET`), then validates and applies the intent.

### 19.5 Report issue algorithm (`REPORT_ISSUE` event at time `t`)
```text
ch = channels[def.channel]
mode = ch.mode (as of t, after any RESTORE/DEGRADE events at t)
base = channelDef.baseDelaySec
switch mode:
  HEALTHY: deliveredAt = t + base
  NOISE:   deliveredAt = t + base            (reliability handled by healthMultiplier at belief time)
  DELAY:   deliveredAt = t + base + ch.extraDelaySec
  DROPOUT: status = DROPPED; droppedReason = 'DROPOUT'; deliveredAt = null
  BURST:   deliveredAt = ch.untilSec (restore time); if untilSec null → treat as DROPOUT
status = (deliveredAt == t) ? DELIVERED (immediate) : IN_TRANSIT; schedule REPORT_DELIVER at deliveredAt
store healthMultiplierAtIssue = ch.healthMultiplier on the ReportRuntime (field `healthAtIssue`)
```
`ReportRuntime.healthAtIssue` (Section 13) stores the multiplier at issue time.

### 19.6 Intent handling summary
| Intent | Validation | Mutation |
|---|---|---|
| START | phase IDLE | RUNNING |
| PAUSE/RESUME | phase RUNNING/PAUSED | toggle |
| OPEN_REPORT | report exists, status DELIVERED (or IN_TRANSIT rejected), visible to role | append `InspectRecord` (idempotent per (reportId, role)) |
| SET_ESTIMATE | `0 <= p <= 1`, phase RUNNING | append `EstimateRecord`; if aidMode AFTER_ESTIMATE and hypothesis primary → `aidRevealedAtSec = t` (first time only) |
| REVEAL_AID | aidMode AFTER_ESTIMATE | `aidRevealedAtSec = t` |
| VERIFY | asset in current DP's `assets`; capacity left; `t + delaySec <= closeSec` else `VERIFY_TOO_LATE` | create `VerificationRecord` + `ReportRuntime` (origin VERIFY, issuedAt = deliversAt, deliveredAt = deliversAt, status IN_TRANSIT) + schedule delivery |
| RELAY | P2; Section 29 | create relayed report |
| DECIDE | Section 17.2 | `DecisionRecord`, phase transition |
| INJECT | role INSTRUCTOR; preset exists | Section 21.6 |
| RESET | any | `createSession(...)` |

19.7 Verification result content (`TRUTH_CONSISTENT`): `stance = truth[hypothesisId] ? +1 : -1` evaluated at request time; claim from `resultClaims`; `rho = asset.rho`; `evidenceGroup = 'GV-' + verificationId`; `issuedAtSec = deliversAtSec`. In `STOCHASTIC` mode: `matches = rng.next() < asset.rho`; `stance = matches ? truthStance : -truthStance`; RNG stream is `rng(seed ^ hash(verificationId))`.

19.8 Capacity rule: each asset can be used `capacity` times per decision point. A repeated VERIFY of the same asset returns `ASSET_EXHAUSTED`.

---

## 20. INFORMATION QUALITY MODEL (`src/engine/belief.ts` inputs)

20.1 A delivered report's quality is determined by exactly four things; there are no hidden factors:
| Factor | Source | Effect |
|---|---|---|
| Source reliability ρ | scenario `rho` | Baseline accuracy when fresh and channel healthy |
| Age | `now − issuedAt` | Decay toward uninformative (Section 22.2) |
| Channel health at issue | `healthAtIssue` (NOISE mode multiplier) | Further shrinks excess accuracy |
| Independence | `evidenceGroup` | Duplicates within a group are not double-counted |
20.2 Provenance fields shown on every report card: channel, source label, issuedAt, deliveredAt, delay (`deliveredAt − issuedAt`), age now, reliability grade, evidence group tag, status badges (`DELAYED`, `STALE`, `RELAYED`, `UNCONFIRMED` for injected false reports, `VERIFIED` for verification results).
20.3 Reliability grade mapping (display only; never used in math): ρ ≥ 0.85 → "A", 0.75–0.849 → "B", 0.65–0.749 → "C", < 0.65 → "D". Label: "Source grade (scenario-assigned)".
20.4 `STALE` badge rule: effective accuracy has decayed below 60% of the report's original excess accuracy: `exp(−age/τ) < 0.6`.
20.5 Corroboration: independent evidence groups that agree reinforce each other automatically (their log-likelihood ratios add). Identical evidence repeated within one group adds nothing (Section 22.4).

---

## 21. COMMUNICATION DEGRADATION ENGINE (`degradation.ts`, `channels.ts`)

21.1 Model the training effect only. No packet, bandwidth, protocol or RF simulation.
21.2 Modes:
| Mode | Effect on reports issued while active | Channel health label |
|---|---|---|
| HEALTHY | delivered at `issuedAt + baseDelay` | HEALTHY |
| DELAY | delivered `extraDelaySec` later | DEGRADED |
| DROPOUT | never delivered (status DROPPED) | DOWN |
| BURST | held and delivered together at restore time | DEGRADED |
| NOISE | delivered normally; `healthMultiplier m ∈ (0,1)` shrinks excess accuracy | DEGRADED |
21.3 Overlapping degradation on the same channel: the later `CHANNEL_DEGRADE` replaces the earlier (single active mode per channel). `untilSec` of the replacement governs. A `CHANNEL_RESTORE` scheduled for the earlier degradation MUST be ignored if `ch.untilSec` no longer matches that restore's time (guard: restore applies only if `restore.atSec === ch.untilSec`).
21.4 Health label `lastContact`: UI shows "last report received N min ago" from `lastDeliveredAtSec`; if the channel is DOWN or DEGRADED and N > 6 min, show a stale indicator (hatched bar).
21.5 Helper: `computeEffectiveAccuracy(rho, ageSec, tauSec, healthMultiplier)` (Section 22.2) is the only place decay is computed.
21.6 Instructor injects (`INJECT` intent) compile presets into timeline events at the inject time `t`:
- `DEGRADE` → `CHANNEL_DEGRADE` at `t` with `untilSec = t + durationSec`; auto `CHANNEL_RESTORE` at `untilSec`.
- `RESTORE_ALL` → `CHANNEL_RESTORE` for all channels at `t` (priority ordering ensures it precedes new issues at `t`).
- `FALSE_REPORT` → a new `ReportRuntime` (origin INJECT) with `id = 'INJ' + (injectedCounter + 1)`, `evidenceGroup = 'GINJ' + n`, `issuedAtSec = t`, delivered through the normal channel pipeline.
All injects are logged as intents; replay reproduces them exactly.

---

## 22. BELIEF ENGINE (`belief.ts`, `contradiction.ts`, `entropy.ts`)

### 22.1 Purpose
Compute, for each hypothesis, the probability that it is true given the delivered reports at time `t`, in a transparent way a judge can follow in 30 seconds: "each report nudges the odds by its reliability, fading with age; reports from the same observation count once."

### 22.2 Formulas (MUST implement exactly)
For hypothesis `h` with prior `π`:

Prior log-odds: $L_0 = \ln\frac{\pi}{1-\pi}$

Age in minutes: $a_i = (t - \text{issuedAt}_i)/60$ (use `t` = evaluation time, NOT delivery time)

Decay factor: $k_i = e^{-a_i/\tau_c}$ where $\tau_c$ is the channel time constant in minutes

Effective accuracy: $A_i = \tfrac12 + (\rho_i - \tfrac12)\, k_i\, m_i$ where $m_i$ = `healthAtIssue` (1 when healthy)

Signed log-likelihood ratio (nats): $\ell_i = s_i \ln\frac{A_i}{1-A_i}$ with $s_i \in \{-1,+1\}$ (stance); neutral reports have no term

Evidence-group rule: among delivered reports of the same `evidenceGroup` and hypothesis, only ONE term counts: if all stances agree, the term with the largest $|\ell|$; if stances conflict, the most recently issued report (tie → higher sequence)

Posterior log-odds: $L = \mathrm{clamp}\!\left(L_0 + \sum_{g}\ell_g,\; -C,\; +C\right)$ with $C$ = `model.llrClamp` (5)

Posterior probability: $p = \dfrac{1}{1+e^{-L}}$

Binary entropy (bits): $H(p) = -p\log_2 p - (1-p)\log_2(1-p)$, $H(0)=H(1)=0$

Fog Index: $F = \tfrac{1}{K}\sum_{h} H(p_h)$ over all hypotheses ($K$ = number of hypotheses)

Positive/negative evidence mass: $W^{+}=\sum_{\ell_g>0}\ell_g,\ W^{-}=\sum_{\ell_g<0}|\ell_g|$

Contradiction index: $C_{idx} = 1-\dfrac{|W^{+}-W^{-}|}{W^{+}+W^{-}}$ if $W^{+}+W^{-}\ge 0.2$, else 0. A hypothesis is `contradicted` iff $C_{idx}\ge$ `contradictionThreshold` AND $\min(W^{+},W^{-}) \ge$ `contradictionMinNats`.

Contribution weight for visualization: $w_g = |\ell_g| / \max_g |\ell_g|$ (0 if no contributions).

### 22.3 Worked example (t = 22:00, hypothesis `north_pass`, prior 0.70)
- $L_0 = \ln(0.7/0.3) = 0.8473$.
- R01: LAND ρ=.85, age 19 min, τ=20 → k = e^{−0.95} = 0.3867; A = .5 + .35×.3867 = .6353; ℓ = ln(.6353/.3647) = +0.5553.
- R02: AIR ρ=.80, age 17, τ=15 → k = .3220; A = .5 + .30×.3220 = .5966; ℓ = +0.3913.
- R04: CYBER ρ=.65, age 14, τ=25 → k = .5712; A = .5 + .15×.5712 = .5857; ℓ = +0.3461.
- R05: CYBER ρ=.60, age 5, τ=25 → k = .8187; A = .5 + .10×.8187 = .5819; ℓ = −0.3305.
- R06: LAND ρ=.75, age 6 (issued 16, now 22), τ=20 → k = .7408; A = .5 + .25×.7408 = .6852; ℓ = −0.7778.
- $L = 0.8473 + 0.5553 + 0.3913 + 0.3461 − 0.3305 − 0.7778 = 1.0317$ → $p = 0.7372$ ✓ (matches golden).
- $W^{+}=1.2927$, $W^{-}=1.1083$ → $C_{idx} = 1 − 0.1844/2.4010 = 0.9232$ ✓.
(R10 is DROPPED so it contributes nothing; R07 is not yet issued.)

### 22.4 Edge cases (each has a unit test)
| Case | Behaviour |
|---|---|
| No delivered reports | $p=\pi$; entropy of the prior; $C_{idx}=0$ |
| All evidence in one group | Strongest term only |
| Report with `A` ≤ 0.5 due to decay | $\ell = 0$ (clamp `A` to ≥ 0.5 + 1e-9) |
| `healthAtIssue` = 0.5 | Excess accuracy halves |
| Neutral report (stance 0) | No term; appears in feed and AAR only |
| Clamp reached | $|L| = 5$ → $p ∈ \{0.0067, 0.9933\}$ |
| Evaluation time before a report's delivery | Report not included (use `deliveredAtSec <= t`, status DELIVERED) |

### 22.5 API (`belief.ts`)
```ts
export function computeBelief(scenario: ScenarioDef, state: SimState, tSec: SimSeconds, opts?: { visibleChannels?: ChannelId[]; extraReports?: ReportRuntime[]; excludeReportIds?: ReportId[] }): BeliefSnapshot;
export function effectiveAccuracy(rho: number, ageSec: number, tauSec: number, m: number): number;
export function llr(accuracy: number, stance: Stance): number;
export function logistic(x: number): number;
```
`extraReports` and `excludeReportIds` exist for what-if recomputation (dropped-report reveal, counterfactuals). Visibility filtering exists for multiplayer role beliefs.

### 22.6 UI representation
Belief gauge per hypothesis (probability bar + numeric), Fog Index meter, Evidence Waterfall (log-odds contributions as signed bars from the prior marker), Contradiction Meter (two opposed arcs sized by $W^{+}$ and $W^{-}$), Fog Veil on report cards (opacity from weight $w_g$ × freshness).
### 22.7 Failure case and fallback
Failure case: a scenario author assigns unrealistic reliabilities leading to overconfident beliefs. Fallback: the clamp ($C=5$) and the Reference Model drawer which shows every parameter. No fallback to ML.
### 22.8 Why it belongs
It is the minimal model that makes "information quality" (reliability, age, health, independence, contradiction) explicit and auditable. A simpler model (average of confidences) cannot express contradiction or decay; a more complex model (Dempster–Shafer, particle filters) is unnecessary for binary route hypotheses.

---

## 23. DECISION ENGINE AND VALUE-OF-INFORMATION ENGINE (`decision.ts`, `voi.ts`)

### 23.1 Joint states and belief factorization
States are all assignments of truth values to hypotheses (2^K, K ≤ 6). Hypotheses are treated as independent: $P(s)=\prod_h p_h^{[s_h]}(1-p_h)^{[1-s_h]}$.

### 23.2 Utility with delay cost
For action $a$, state $s$, decision time $t$ (seconds) and decision point `dp`:
$$U_t(a,s)=u(a,s)-c\cdot\max\!\left(0,\tfrac{t-\text{departure}}{60}\right)\cdot\mathbf 1[\text{delayCostApplies}(a)]$$
where $u(a,s)$ is the first matching `utility` rule and $c$ = `delayCostPerMin`.

### 23.3 Expected utility, best action, regret, tie
$$EU_t(a)=\sum_s P(s)\,U_t(a,s)\qquad a^*=\arg\max_a EU_t(a)$$
Tie-break: if the top two expected utilities differ by less than `tieEpsilon`, set `isTie = true` and choose by action order in the scenario for `a*` display only.
Regret under belief: $R_t=EU_t(a^*)-EU_t(a_t)$ where $a_t$ is the chosen action. Maximum regret: $R_{max}=EU_t(a^*)-\min_a EU_t(a)$.

### 23.4 Posture
- `OVER_CAUTIOUS`: the chosen action's id is the scenario's designated cautious action (the DP's `timeoutActionId`) and $a^*\neq a_t$ and $R_t>$ `tieEpsilon`.
- `OVER_COMMITTED`: $a_t\neq a^*$, $a_t \neq$ cautious action and $R_t>$ `tieEpsilon`.
- else `BALANCED`.

### 23.5 EVPI ("price of fog")
$$EVPI_t=\sum_s P(s)\max_a U_t(a,s)-\max_a EU_t(a)$$
Interpretation shown in UI: "Perfect information at this moment would have been worth up to X points."

### 23.6 EVSI and net VOI (verification)
For an asset with accuracy $\rho_v$ about hypothesis $h$ with current belief $p=p_h$:
- $P(y{=}\text{supports})=p\rho_v+(1-p)(1-\rho_v)$, posterior $p'_+=\dfrac{p\rho_v}{P(y{=}\text{supports})}$
- $P(y{=}\text{contradicts})=p(1-\rho_v)+(1-p)\rho_v$, posterior $p'_-=\dfrac{p(1-\rho_v)}{P(y{=}\text{contradicts})}$
$$EVSI_t=\sum_{y}P(y)\max_a EU_t(a\mid p'_y)-\max_a EU_t(a)$$
(utilities evaluated at the same time $t$ — time cost handled separately.)
$$NetVOI_t=EVSI_t-c\cdot\tfrac{\text{delay}_v}{60}-\text{cost}_v$$
where $c\cdot \text{delay}_v/60$ is the delay cost of waiting for the result (applies if any GO action is still the best use of the information; the engine ALWAYS subtracts it for a conservative estimate) and cost$_v$ is `costUnits`.
Example (golden): at $t=22$ with $\rho_v=0.95$: EVSI 31.38 − 9.00 − 5.00 = **17.38**.

### 23.7 Verification feasibility
Verification result must arrive before the window closes: `t + delaySec < closeSec`. Otherwise `VERIFY_TOO_LATE` (the UI disables the button with the reason "Result would arrive at 32:00, after the 30:00 deadline").
The AAR defines `t_lastChance = closeSec − delaySec − 1` (in seconds; display in minutes).

### 23.8 What the trainee sees vs what only the AAR shows
- During play: asset cost, delay, accuracy grade ("A/B/C"), feasibility. NO EVSI hints (training integrity).
- Instructor view: EVSI/EVPI live (diagnostic panel).
- AAR: EVPI at decision, EVSI/NetVOI at the evaluation time, verdict.

### 23.9 API (`decision.ts`, `voi.ts`)
```ts
export function expectedUtilities(dp: DecisionPointDef, belief: BeliefSnapshot, tSec: SimSeconds, hyps: HypothesisDef[]): Record<ActionId, number>;
export function evaluateDecision(dp, belief, tSec, hyps, chosen: ActionId): { eu: Record<ActionId, number>; bestActionId: ActionId; isTie: boolean; regret: number; maxRegret: number; dq: number; posture: Posture; evpi: number };
export function realizedUtility(dp, truth: Record<HypothesisId, boolean>, actionId: ActionId, tSec: SimSeconds): number;
export function evsi(dp, belief, tSec, asset: AssetDef, hyps): number;
export function netVoi(dp, belief, tSec, asset: AssetDef, hyps): { evsi: number; timeCost: number; assetCost: number; net: number; feasible: boolean };
```
$DQ = 1 - R_t/R_{max}$ if $R_{max}>0$, else 1.

---

## 24. SCORING ENGINE (`scoring.ts`, `calibration.ts`)

### 24.1 Metric definitions (all in [0,1] unless stated)
| Metric | Formula | Interpretation | Edge cases |
|---|---|---|---|
| Decision Quality (DQ) | $1-R_t/R_{max}$ | Was this the best action given what had arrived? 1 = best under belief | $R_{max}=0$ → 1; timeout decisions use the timeout action's regret |
| Outcome (O) | $\mathrm{clip}\big((U_{real}+100)/200,0,1\big)$ with the scenario's `outcomeScale`; $U_{real}$ includes delay cost and verification asset costs | What actually happened | Clipping at 0 and 1 |
| Information Utilization (IU) | $\dfrac{\sum_{g\ \text{opened}}|\ell_g|}{\sum_g |\ell_g|}$ over contributing evidence groups at decision time, using the group's selected report; "opened" = that report was inspected before decision | Did you read the evidence that moved the belief? | No contributions → 1 |
| Timeliness (T) | $\max\!\big(0,\,1-\dfrac{\text{effLatencySec}}{\text{closeSec}-\text{openSec}}\big)$ | Penalizes waiting; excludes net-positive verification wait | Timeout → 0 |
| Verification Efficiency (VE) | see 24.3 | Used verification when worth it, skipped when not | No assets → 1 |
| Calibration Alignment (CAL) | $1-\min(1,|q-p_{sys}|/0.5)$ | How close your stated probability was to the reference belief | No estimate → 0 |

Effective latency is represented in seconds throughout the engine: $\text{effLatencySec}=(t_d-\text{openSec})-\text{verifyWaitSec}$. Set `verifyWaitSec = verification.delaySec` when the verification had `netVOI >= 0` at tasking; otherwise set it to `0`. Convert to minutes only for display. The denominator for Timeliness is `closeSec - openSec`, so numerator and denominator MUST use the same unit.

### 24.2 Training Score (composite, 0–100)
$$S=100\cdot\left(w_{DQ}\,DQ+w_{IU}\,IU+w_{O}\,O+w_{T}\,T+w_{VE}\,VE+w_{CAL}\,CAL\right)$$
Weights come from the scenario (`scoreWeights`; flagship .40/.15/.15/.10/.15/.05). Rationale: outcome is capped at 15% (outcome bias, V1); calibration at 5% (contested evidence, V3). Display the composite as "Training Score" with the six components beside it. NEVER label it "accuracy".

### 24.3 Verification Efficiency (exact algorithm)
```text
if scenario has no assets for the DP: VE = 1
if verified (any VerificationRecord at this DP):
    v = first verification; bv = belief at v.requestedAtSec; nv = netVoi(dp, bv, v.requestedAt, asset)
    waste = max(0, -nv.net)
    VE = 1 - min(1, waste / EVPI(bv, v.requestedAt))           (EVPI = 0 → VE = 1)
else:
    t_eval = min(t_d, closeSec - bestAsset.delaySec - 1s)       (the last moment verification could still help, or the decision time if earlier)
    bv = belief at t_eval; best = max over feasible assets of netVoi.net
    missed = max(0, best)
    VE = 1 - min(1, missed / EVPI(bv, t_eval))
```
Golden: Path A → 1.0000; Path B → 0.7388 (t_eval 24:00 → 6.93/26.53); Path C → 1.0000.

### 24.4 Calibration (`calibration.ts`)
- `calibrationAlignment(q, pSys) = 1 − min(1, |q − pSys| / 0.5)`.
- `brier(q, truth) = (q − (truth ? 1 : 0))²`. Reported for the user's estimate AND the system belief, each with the label "single-event Brier: noisy; meaningful only across sessions".
- `reliabilityBins(summaries)` → 5 bins [0–.2, .2–.4, .4–.6, .6–.8, .8–1] with count, mean stated probability, observed frequency of truth (P2 analytics; show only when n ≥ 3 per bin, else "not enough data"). Use half-open bins `[0,0.2)`, `[0.2,0.4)`, `[0.4,0.6)`, `[0.6,0.8)`, `[0.8,1]` so boundary values belong to exactly one bin.
- The trainee's "final estimate" is the last `SET_ESTIMATE` at or before the decision for the primary hypothesis. The initial estimate (first one) is also stored; AAR shows revision `q_first → q_final` and whether the aid was consulted (`AFTER_ESTIMATE` mode).

### 24.5 Information Utilization details
Use the contributing set at decision time (after the evidence-group rule). A group counts as opened if the report that was SELECTED for the group, or any report in that group, was opened (the trainee read the evidence group). Verification result reports count as normal groups.

### 24.6 Latency
"Decision latency" displayed = `t_d − openSec` (mm:ss). Timeliness uses the seconds-normalized `effLatencySec` from 24.1. Timeout: `t_d = closeSec`, T = 0.

### 24.7 Quadrant thresholds
`SOUND`: DQ ≥ 0.8. `GOOD_OUTCOME`: Outcome score O ≥ 0.6 (realized utility ≥ 20 on the flagship scale).
- SOUND and GOOD_OUTCOME → SOUND_SUCCESS
- SOUND and not GOOD_OUTCOME → SOUND_UNLUCKY
- not SOUND and GOOD_OUTCOME → LUCKY
- not SOUND and not GOOD_OUTCOME → POOR
Check against golden paths: A (DQ 1.00, O 0.6975) → SOUND_SUCCESS; B (DQ 1.00, O 0.00) → SOUND_UNLUCKY; C (DQ 1.00, O 0.07) → SOUND_UNLUCKY; D (DQ 0.00, O 0.55) → POOR.

### 24.8 Display rules (tooltips; text is exact)
| Metric | Tooltip |
|---|---|
| DQ | "How good the decision was given what had arrived by the time you made it. 100% means no other action had a higher expected value." |
| Outcome | "What actually happened under the hidden truth. Luck affects this score." |
| Information Utilization | "Share of the evidence weight (after removing duplicates) that you opened before deciding." |
| Timeliness | "Penalty for time spent deciding. Waiting for a verification worth its cost is not penalized." |
| Verification Efficiency | "Whether you used verification when it was worth its time and cost, and skipped it when it was not." |
| Calibration Alignment | "How close your stated probability was to the reference model's probability. Noisy for a single decision." |
| Fog Index | "Average uncertainty across hypotheses. 0% = certain, 100% = coin flip." |
| EVPI | "The most that perfect information would have been worth at that moment." |

### 24.9 Test requirements
Golden paths A–F plus unit tests: DQ range [0,1]; composite weights sum; IU with duplicates; VE branches (verified-worthwhile, verified-wasteful, skipped-worthwhile, skipped-correctly); quadrant truth table.

---

## 25. AAR ENGINE (`aar.ts`, `coach.ts`, `export.ts`)

### 25.1 AAR object (exact shape)
```ts
export interface Aar {
  schemaVersion: 1;
  dataProvenance: 'SYNTHETIC SCENARIO — fictional entities; reliabilities and utilities are authoring assumptions';
  scenario: { id: string; version: number; title: string; hash: string; seed: number; difficultyLevel: number };
  participants: { role: RoleId; name?: string }[];
  header: { completedAtIso: string | null; decisionAtSec: SimSeconds; decisionLatencySec: SimSeconds; timedOut: boolean };
  decision: {
    actionId: ActionId; actionLabel: string; belief: Record<HypothesisId, number>; bestActionId: ActionId; isTie: boolean;
    expectedUtilities: Record<ActionId, number>; regret: number; maxRegret: number; evpi: number; posture: Posture;
    estimates: { first: number | null; final: number | null; consultedAid: boolean };
    rationale: Rationale | null;
  };
  scores: {
    dq: number; outcome: number; infoUtil: number; timeliness: number; verifyEff: number; calibration: number; trainingScore: number;
    quadrant: Quadrant; realizedUtility: number; brierUser: number | null; brierSystem: number;
  };
  truth: Record<HypothesisId, boolean>;
  consequence: { headline: string; narrative: string };
  timeline: TimelineEntry[];          // chronological: reports issued/delivered/dropped, degradations, inspections, estimates, verifications, decisions, truth changes
  frames: ReplayFrame[];              // belief snapshots at each timeline time (Section 30)
  information: {
    delivered: ReportView[]; opened: ReportId[]; notOpened: { reportId: ReportId; llr: number }[];
    dropped: { reportId: ReportId; issuedAtSec: SimSeconds; claim: string; whatIfBeliefAtDecision: Record<HypothesisId, number> }[];
    lateOrAfterDecision: { reportId: ReportId; issuedAtSec: SimSeconds; deliveredAtSec: SimSeconds; claim: string }[];
    contradictions: { atSec: SimSeconds; hypothesisId: HypothesisId; index: number; positiveReportIds: ReportId[]; negativeReportIds: ReportId[] }[];
  };
  verification: null | {
    used: boolean; assetId?: AssetId; requestedAtSec?: SimSeconds; deliveredAtSec?: SimSeconds;
    netVoiAtEval: number; evsiAtEval: number; evpiAtEval: number; evalAtSec: SimSeconds; verdict: 'WORTH_IT_USED' | 'WORTH_IT_SKIPPED' | 'NOT_WORTH_IT_SKIPPED' | 'NOT_WORTH_IT_USED' | 'TOO_LATE_OR_UNAVAILABLE';
  };
  counterfactuals: Counterfactual[];   // Section 30
  coachNotes: CoachNote[];
  team?: TeamSection;                  // P2/P3
  limitations: string[];               // Section 3.4 text
}
export interface TimelineEntry { atSec: SimSeconds; lane: 'LAND'|'AIR'|'CYBER'|'EW'|'SYSTEM'|'TRAINEE'|'INSTRUCTOR'; kind: string; summary: string; reportId?: ReportId; revealedToTrainee: boolean }
export interface CoachNote { id: string; severity: 'INFO' | 'GOOD' | 'ATTENTION'; text: string; evidence: string[] }
```
### 25.2 Builder (`buildAar(scenario, log): Aar`)
Steps: (1) `replayLog` to completion; (2) locate the last decision; (3) compute belief at decision time using ONLY delivered reports; (4) `evaluateDecision`; (5) `realizedUtility` with truth + verification costs; (6) scores; (7) information analysis; (8) verification analysis; (9) counterfactuals; (10) coach notes; (11) frames. The builder takes ONLY `(scenario, log)` so exports can be regenerated from stored logs. Time: ≤ 150 ms.

### 25.3 "What you never saw" (information.dropped / lateOrAfterDecision)
For each DROPPED report r: compute `whatIfBeliefAtDecision = computeBelief(..., { extraReports: [r delivered at issue time] })`. For late deliveries compute the belief if it had arrived on time. Golden: R10 what-if at t=20:00 → p(north) 0.5488 vs actual 0.8733; at t=22:00 → 0.4026 vs 0.7372; R11 delivered 31:00: p(north) = 0.4695 at t=31 vs 0.7808 at t=30.

### 25.4 Coach notes (deterministic rules, `coach.ts`; evaluated in order; at most 5 shown, severity ATTENTION first)
| Rule id | Condition | Text template (fill `{}` from data) |
|---|---|---|
| C1 | quadrant SOUND_UNLUCKY | "Sound decision, unfavourable outcome. By {t}, {action} had the highest expected value ({eu}). The hidden truth was {truthLabel}. Judge the decision by what you knew, not by how it ended." |
| C2 | quadrant LUCKY | "Favourable outcome from a weak decision. {action} had lower expected value ({eu}) than {best} ({euBest}) given what had arrived. Luck, not judgement, produced the result." |
| C3 | quadrant SOUND_SUCCESS | "Well judged and well rewarded: {action} was the best action given the evidence at {t}." |
| C4 | quadrant POOR | "Weak decision and unfavourable outcome. Regret under belief was {regret}. Review the contradiction at {t} and the reports you did not open." |
| C5 | verification.verdict = WORTH_IT_SKIPPED | "A verification tasked by {tLast} was worth +{netVoi} net. You did not use it. Evidence conflicted (contradiction index {ci}); that is when verifying pays." |
| C6 | verification.verdict = WORTH_IT_USED | "Verifying at {tReq} was worth +{netVoi} net and changed your belief from {pBefore} to {pAfter}." |
| C7 | verification.verdict = NOT_WORTH_IT_USED | "Verification cost more than it was worth at {tReq} (net {netVoi}). The picture was already clear enough." |
| C8 | notOpened has an item with llr ≥ 0.3 | "You did not open {reportId} ('{claim}'), which carried {weightPct}% of the evidence weight." |
| C9 | dropped nonempty | "{n} report(s) never reached you. Had {reportId} arrived on time your belief in '{hyp}' would have been {pWhatIf} instead of {pActual}." |
| C10 | posture OVER_CAUTIOUS | "You stood down while {best} had higher expected value. Waiting has a price: every minute after {departure} lowers the payoff." |
| C11 | posture OVER_COMMITTED | "You committed to {action} while {best} was better under your belief. Pause to compare expected values when evidence conflicts." |
| C12 | estimates.first and final differ by ≥ 0.15 | "You revised your estimate from {first} to {final}. The reference belief was {pSys}." |
| C13 | timedOut | "The decision window expired. Standing down is the default; it carries a latency penalty." |
| C14 | isTie | "The evidence did not clearly favour either route at {t}. When options are tied, information is the highest-value move." |
Coach text MUST be generated from templates; NEVER by an LLM in P0–P2. Numbers are formatted by `utils/format.ts`.

### 25.5 AAR sections on screen (Section 38.12) and exports
- **Exports (`export.ts`)**: (a) JSON: full `Aar` object; (b) CSV: one row per timeline entry (`atSec,lane,kind,summary,reportId,revealedToTrainee`) plus a second CSV `decisions.csv` with one row per decision (`role,atSec,action,belief,regret,dq,outcome,rationaleText,citedReports,tags`); (c) printable view: `window.print()` using `src/styles/print.css` (A4, 12 mm margins, no navigation, page breaks before "Timeline" and "Counterfactuals").
- Rationale capture (Section 28.6) is included in all three exports.

### 25.6 Team AAR (P2) — see Section 29.7.

---

## 26. SCENARIO MUTATION AND ADAPTIVE DIFFICULTY (P2) — `mutation.ts`, `difficulty.ts`

### 26.1 Contract
```ts
export interface DifficultyProfile { level: 1|2|3|4|5; delayScale: number; dropoutExtensionMin: number; closeDeltaMin: number; jitterMin: number; decoys: number }
export const PROFILES: Record<1|2|3|4|5, DifficultyProfile> = {
  1: { level: 1, delayScale: 0.5,  dropoutExtensionMin: 0, closeDeltaMin: +4, jitterMin: 0, decoys: 0 },
  2: { level: 2, delayScale: 0.75, dropoutExtensionMin: 0, closeDeltaMin: +2, jitterMin: 1, decoys: 0 },
  3: { level: 3, delayScale: 1.0,  dropoutExtensionMin: 0, closeDeltaMin:  0, jitterMin: 1, decoys: 1 },
  4: { level: 4, delayScale: 1.25, dropoutExtensionMin: 1, closeDeltaMin: -2, jitterMin: 2, decoys: 1 },
  5: { level: 5, delayScale: 1.5,  dropoutExtensionMin: 2, closeDeltaMin: -3, jitterMin: 2, decoys: 2 },
};
export function mutateScenario(base: ScenarioDef, seed: number, level: 1|2|3|4|5): ScenarioDef;
export function nextDifficulty(current: 1|2|3|4|5, scores: { dq: number; infoUtil: number; quadrant: Quadrant }): { level: 1|2|3|4|5; reason: string; changes: string[] };
```
### 26.2 Operators
| Id | Kind | Rule |
|---|---|---|
| M0 | deterministic | Delay scale: every `CHANNEL_DEGRADE.extraDelaySec` × `delayScale`, rounded to whole minutes, minimum 60 s |
| M1 | deterministic | Dropout extension: each DROPOUT `untilSec += dropoutExtensionMin×60` (but < `closeSec`) |
| M2 | deterministic | Deadline: `closeSec += closeDeltaMin×60` for every DP (never below `openSec + 600 s`) |
| M3 | seeded | Time jitter: each `REPORT_ISSUE` and each `CHANNEL_DEGRADE.atSec` shifted by an integer minute in `[-jitter, +jitter]` (RNG stream `rng(seed ^ 0x51)`), never before 60 s, never after `closeSec − 120 s`; `TRUTH_CHANGE` is NOT shifted |
| M4 | seeded | Reliability perturbation: `rho += uniform(−0.05, +0.05)` clamped to [0.55, 0.95] for scenario reports (not assets) (stream `seed ^ 0x52`) |
| M5 | seeded | Decoy reports: add `decoys` low-reliability reports (ρ ∈ [0.55, 0.62]) on CYBER or EW with stance OPPOSITE to the initial truth of the primary hypothesis, each in its own evidence group `GDECOY{n}`, issued uniformly between first degradation start and `closeSec − 180 s` (stream `seed ^ 0x53`) |
Seeded operators run ONLY when `seed !== 0`. Deterministic operators always run. Identity rule: `level === 3 && seed === 0` MUST return the base scenario unchanged (golden contract).
### 26.3 Validity gate (mutation MUST NOT produce an unplayable scenario)
After mutation: (1) `loadScenario` invariants; (2) at least one contradiction condition is reachable: simulate belief each minute and assert there exists a minute `m ≤ closeSec` with `contradicted` true on the primary hypothesis; (3) a verification is feasible: there exists a minute `m ≤ closeSec − asset.delaySec − 60` with `netVoi.net ≥ 0`. If a gate fails, retry with `seed' = hash(seed + attempt)` up to 20 attempts; otherwise return the deterministic-only variant and log a warning.
### 26.4 Adaptive rule (`nextDifficulty`)
- If `dq ≥ 0.8` AND `infoUtil ≥ 0.7` AND `quadrant !== 'LUCKY'` → level + 1 (max 5); reason "Strong decision quality with good use of evidence."
- Else if `dq < 0.5` → level − 1 (min 1); reason "Decision quality was below 50%."
- Else unchanged; reason "Held at the current level."
`changes[]` lists the human-readable profile deltas of the new level vs the old one (e.g., "Delays ×1.25", "+1 decoy report", "Deadline −2 min").
### 26.5 Fairness constraints (MUST hold)
Difficulty NEVER changes: hidden truth, utilities, asset reliabilities or costs, scoring weights, formulas. It changes information-flow timing/volume only. The AAR ALWAYS prints the profile used. The trainee can override the level on the Scenario Library screen (stored per scenario).
### 26.6 Tests
Identity at (3,0); determinism for equal (seed, level); invariant satisfaction for seeds 1..200 at each level (property-style loop); gate-fallback path covered by a scenario fixture with no feasible verification.

---

## 27. INSTRUCTOR SYSTEM

### 27.1 Capabilities (E3)
| Phase | Capability | Control | Intent / effect |
|---|---|---|---|
| Before start | Configure variables | Parameters panel: difficulty level (1–5), seed, speed (2/4/6 s per sim-minute), aid mode (ALWAYS / AFTER_ESTIMATE), scenario | Session config (not intents) |
| Running | Start / Pause / Resume / Reset | Session Controls | START / PAUSE / RESUME / RESET |
| Running | Inject degradation or conflicting report | Inject Panel (presets in scenario JSON) with 3 s cooldown per preset | INJECT |
| Running | Monitor trainees live | Live Monitor | Read-only view stream |
| Running | See ground truth and model diagnostics | Instructor-only chips and Diagnostics card | Read-only |
| Complete | Open AAR; hold debrief | AAR with team section | — |
### 27.2 Live Monitor contents (updates at 2 Hz)
- Sim clock (mm:ss), phase, speed.
- Roster with connection status (role, name, ● connected / ○ disconnected).
- Per trainee: reports opened (n / delivered), last opened report, latest estimate (primary hypothesis), whether the aid was revealed, verification state (none / tasked / result at mm:ss), decision state.
- Reference belief per hypothesis, Fog Index, contradiction flag.
- Diagnostics card (instructor only): expected utilities per action at `now`, `a*`, EVPI, EVSI/net VOI per asset, `isTie`. Label: "Diagnostics — not visible to trainees".
- Event log (newest first, max 50): degradations, injects, deliveries/drops, decisions.
### 27.3 Inject cooldown and safety
Instructor injects are rejected with `UNKNOWN_PRESET` if the id is not in the scenario. The UI disables a preset for 3 s after use. Injects after the decision window closes are allowed but marked `post-decision` in the log.
### 27.4 Local-mode instructor
In `LocalSessionClient`, the same `InjectPanel` and `SessionControls` render in a **Control Drawer** opened with key `I` in the Trainee Console. Intents carry `role: 'INSTRUCTOR'`. The drawer is hidden unless URL has `?controls=1` or Demo Mode is active.
### 27.5 Keyboard shortcuts (Instructor Console and Control Drawer)
`Space` pause/resume · `1`–`5` inject preset by index · `R` reset (opens confirm dialog) · `T` toggle truth display · `M` toggle diagnostics · `?` shortcuts overlay.
### 27.6 Acceptance
Pressing `1` (JAM_LAND) at t = 10:00 produces a LAND channel DEGRADED state within 500 ms, subsequent LAND reports show delivered = issued + 6:00, and the event appears in Live Monitor and AAR timeline with lane INSTRUCTOR.

---

## 28. TRAINEE SYSTEM

### 28.1 Information feed (`ReportFeed.tsx`, `ReportCard.tsx`)
- Newest delivered first; filter chips by channel (ALL, LAND, AIR, CYBER, EW); sorted by `deliveredAt` desc; a divider "Not yet delivered: channel DOWN" never reveals undelivered content.
- Card (collapsed): channel icon + label, claim (title), source grade chip, `issued mm:ss → delivered mm:ss (+Δ)`, age (live), badges (DELAYED, STALE, RELAYED, UNCONFIRMED, VERIFIED, CONTRADICTS #id), Fog Veil rendering (Section 36.5), "NEW" marker until opened.
- Expanding (click/Enter/Space) shows `detail`, evidence group id, effective accuracy now (`A`), and the report's current contribution in nats; logs `OPEN_REPORT` once per report.
- Contradiction link: if a report's stance opposes another delivered report on the same hypothesis in the contributing set, show `CONTRADICTS R0x` chips; hovering highlights the opposing card.
### 28.2 Channel Health Strip (`ChannelHealthStrip.tsx`)
Four channel tiles (LAND, AIR, CYBER, EW): icon, label, health chip (text + icon + pattern; Section 36.4), mode note (e.g., "Delay +6:00 until 26:00" — shown for DEGRADED modes, revealing the instructor-visible reason only as a generic "Link degraded"), last contact "N min ago", sparkline of deliveries in last 10 min.
Local/SOLO trainees see health state and last-contact; they do NOT see `until` times (unknown to them). INSTRUCTOR sees full details.
### 28.3 Belief panel (`BeliefPanel.tsx`, `FogMeter.tsx`, `ContradictionMeter.tsx`, `EvidenceWaterfall.tsx`)
- Per hypothesis: probability bar with numeric %, label "Reference belief" and a small "i" opening the Reference Model drawer.
- Fog meter: Fog Index as a ring (0–100%) with label "Fog".
- Contradiction meter: two opposing arcs sized by $W^{+}$ and $W^{-}$ and a flag chip "Evidence conflicts" when `contradicted`.
- Waterfall: signed horizontal bars for each contribution; hovering shows report id, claim, ρ, age, A, ℓ.
- Aid mode `AFTER_ESTIMATE`: the panel renders with `FoggedPlaceholder` (blurred, "Log your own estimate to reveal the reference belief"); after the first SET_ESTIMATE on the primary hypothesis it reveals with a 320 ms de-blur and shows "Your estimate: x%" marker on the bar. Keyboard users get the same via a "Log estimate" button.
### 28.4 Decision panel (`DecisionPanel.tsx`, `VerifyPanel.tsx`)
- Window banner: "Decision window: OPEN — closes 30:00 (in 05:12)". States: UPCOMING (disabled), OPEN (enabled), CLOSED.
- Estimate control: slider 0–100 labelled "Your probability that {hypothesis} is {trueLabel}" + button "Log estimate" (SET_ESTIMATE). Required before commit when `requiredEstimates` includes the hypothesis.
- Actions: three cards (label, description). Selecting one enables "Commit decision" which opens the RationaleDialog (28.6).
- Verify panel: asset cards with label, delay ("result in 06:00"), cost ("5 units"), accuracy grade chip (A/B/C), feasibility. "Task asset" → VERIFY. Pending state shows countdown and a skeleton report card. Disabled reasons shown verbatim: "Already used", "Result would arrive after the window closes".
- Payoff reference (collapsible): table of payoffs per action/state and the delay cost rule, rendered from scenario data.
### 28.5 Timeline bar (`TimelineBar.tsx`)
Horizontal sim-time axis 0 → duration: decision window shaded; ticks for delivered reports (colored by channel + icon); hatched bands where a channel was DOWN/DEGRADED (revealed only for the segments already passed); cursor = now; markers for verification tasked/result and decision. During replay it becomes the scrubber.
### 28.6 Rationale capture (E4 "rationale")
`RationaleDialog.tsx`: (1) read-only summary of the chosen action; (2) text area "Why this action?" (max 280 chars); (3) checklist of delivered reports ("Which reports did you rely on?") — selected ids become `citedReportIds`; (4) tag chips (`RationaleTag`); (5) buttons "Commit decision" (primary) and "Commit without rationale". Timer continues while the dialog is open; if the window closes while it is open, the decision times out and the dialog shows "Window closed — standing down". `DecisionRecord.rationale` stores the value; AAR/exports include it; coach rule C8 references cited vs weight.
### 28.7 Consequence overlay
After DECIDE, the console shows "Convoy en route…" with a progress ring to `consequenceRevealAtSec`; late reports continue to arrive (labelled "arrived after your decision"). At reveal: a full-width banner with the consequence headline, narrative, and the hidden truth chips; primary button "Open after-action review".
### 28.8 Keyboard operation (MUST work without a mouse)
`J/K` move between report cards · `Enter/Space` open/close card · `E` focus estimate slider (arrow keys ±1, Shift+arrow ±10) · `L` log estimate · `V` focus verify panel · `D` focus decision panel · `Esc` close dialogs · `?` shortcuts. Focus order: header → report feed → belief panel → decision panel → timeline.

---

## 29. MULTIPLAYER SYSTEM (P2; E2)

### 29.1 Roles and visibility
| Role | Channels seen directly | Can act | Cannot |
|---|---|---|---|
| COMMANDER | LAND, AIR | OPEN_REPORT, SET_ESTIMATE, VERIFY, DECIDE | See CYBER/EW unless relayed |
| ANALYST | CYBER, EW | OPEN_REPORT, SET_ESTIMATE, RELAY, ADVISE | DECIDE, VERIFY |
| INSTRUCTOR | all + truth + diagnostics | START, PAUSE, RESUME, INJECT, RESET | Alter decisions |
`visibleTo` in the scenario channel definitions drives this. SOLO sees everything.
### 29.2 Relay mechanic (the coordination under degraded information)
- Analyst selects a delivered report from analyst-visible channels and presses "Relay to Commander" with an optional note (≤ 80 chars).
- Capacity: 3 relays per session (`relayCapacityLeft` shown). Exhausted → `RELAY_LIMIT`.
- Relay creates a `ReportRuntime` with `origin: 'RELAY'`, `def` copied from the original with the SAME `evidenceGroup`, `issuedAtSec` unchanged (age continues), `deliveredAtSec = t + 120 s`, badge RELAYED; `relays[]` records the relay. Relay adds delay, not distortion.
- The Commander's belief = fusion over (reports on commander-visible channels) ∪ (relayed reports delivered to the Commander).
### 29.3 Advice
`ADVISE` intent (Analyst): picks one of the scenario actions + optional note (≤ 80 chars); shown to Commander as "Analyst advises: {action}" with timestamp; logged; no authority.
### 29.4 Authority and synchronization
- The server is authoritative. Clients send `INTENT` messages WITHOUT `t` or `role`; the server stamps both (`t` = server sim time, `role` = the connection's role).
- Each applied change increments `seq`; the server sends each client a role-projected `SessionView`. Clients ignore any `VIEW` with `seq` ≤ last applied.
- The clock loop runs every 500 ms: `advanceTo(state, now)` where `now = elapsedSimSeconds` accumulated at `speedSecPerMin`; paused sessions do not advance. Views are broadcast only when `seq` changes OR the displayed minute changes (so ≤ 2 Hz).
### 29.5 Sessions: create, join, lobby
1. Instructor: Home → "Create session" → `POST /api/sessions` → receives `code`, `clientId`, `token`; navigates to `/instructor/:code` and shows the join code and a copyable link `/join?code=ABC123`.
2. Trainees: `/join` → enter code + name + role (COMMANDER/ANALYST) → WS `HELLO` → `/lobby/:code`. Lobby shows roster and "Waiting for instructor to start…".
3. Instructor presses Start when ≥ 1 trainee role is filled (SOLO-like single-trainee networked mode is allowed: Commander only).
4. Late join: allowed any time before COMPLETE; the joining client receives the current role-projected view.
### 29.6 Reconnect, disconnect, fallback
- Client auto-reconnect: backoff 0.5 s, 1 s, 2 s, 4 s, then 8 s repeating; sends `HELLO` with the stored `clientId` + `token`; the server rebinds the role and sends a fresh `WELCOME` with the current view.
- Disconnect: role marked disconnected in roster; the simulation continues (the instructor may pause). The Commander timing out is possible and expected.
- Token mismatch → `ERROR { code: 'BAD_TOKEN' }` and the client returns to Join.
- After 3 consecutive failed connections: show "Connection unavailable — continue in local mode" button → `LocalSessionClient` with the same scenario/seed/difficulty (role SOLO).
### 29.7 Team AAR section (`Aar.team`)
```ts
interface TeamSection {
  roles: { role: RoleId; name?: string; finalEstimate: number | null; opened: ReportId[]; relays: number }[];
  relays: { reportId: ReportId; fromRole: RoleId; deliveredToCommanderAtSec: SimSeconds; originalDeliveredAtSec: SimSeconds; delaySec: SimSeconds; note?: string }[];
  advice: { atSec: SimSeconds; actionId: ActionId; followed: boolean }[];
  beliefCommanderAtDecision: Record<HypothesisId, number>;
  beliefTeamFullAtDecision: Record<HypothesisId, number>;     // fusion over ALL channels
  heldNotRelayed: { reportId: ReportId; llr: number; whatIfCommanderBelief: Record<HypothesisId, number> }[];
  metrics: { informationSharingRate: number | null; estimateConvergence: number | null; medianRelayDelayMin: number | null };
}
```
Metric definitions (P3 display only; NO composite team score): `informationSharingRate` = relayed-before-decision analyst-channel reports with |ℓ| ≥ 0.3 ÷ all such reports delivered before the decision (null if none); `estimateConvergence` = 1 − |q_commander − q_analyst| (final estimates before decision; null if either missing); `medianRelayDelayMin` = median of (relay delivery − original delivery) in minutes.
### 29.8 Server-side validation (every intent)
role permission; phase; schema (zod); rate limit 10 intents/s per client; `reportId` visibility to the sender; relay capacity; payload sizes (note ≤ 80 chars, rationale text ≤ 280, ≤ 12 cited reports).
### 29.9 Single-user fallback
Everything in Sections 18–25 works without the server. P2 networked mode is an overlay: `RemoteSessionClient` and `server/` can be deleted without breaking local mode.

---

## 30. REPLAY AND COUNTERFACTUAL ANALYSIS (`replay.ts`, `counterfactual.ts`)

### 30.1 Replay
```ts
export interface ReplayFrame {
  atSec: SimSeconds; belief: BeliefSnapshot; deliveredIds: ReportId[]; droppedIds: ReportId[]; openedIds: ReportId[];
  channels: Record<ChannelId, ChannelHealth>; annotations: string[];     // e.g., "Wideband interference on LAND link"
  trainee: { estimate: number | null; verifyPending: boolean; decided: boolean };
}
export function buildFrames(scenario: ScenarioDef, log: SessionLog): ReplayFrame[];
```
Frame times = union of all event times, intent times, decision time, and every full minute from 0 to decision+60 s (cap 80 frames). Replay is a pure fold over `SessionLog`. NFR: ≤ 100 ms.
### 30.2 Replay UI (`ReplayScrubber.tsx`)
Slider across frame times with ticks; Play/Pause at 4× speed (each frame 250 ms); keyboard `←/→` step, `Home/End`. The panel shows: (a) "What the trainee knew" (delivered + opened reports and the belief at that frame), (b) "What was true" toggle (reveals truth and dropped/in-transit reports), (c) channel health at that time. Tab labels: **Knew**, **Truth**, **Never saw**.
### 30.3 Counterfactuals (exact definitions)
Every counterfactual panel MUST carry the label `COUNTERFACTUAL — simulated, not what happened`.
| Id | Title | Computation |
|---|---|---|
| CF_ACTIONS | "If you had chosen differently" | For each action `a`: expected utility under belief at decision time, realized utility under truth (`realizedUtility`), consequence headline from the scenario's consequence table |
| CF_VERIFY_EARLIER | "If you had verified earlier" | Find the earliest minute `m ∈ [openSec, t_lastChance]` with `netVoi.net ≥ 0` (using belief at `m`); build intents' = original intents with `t < m` + `VERIFY` at `m` of the best asset; replay to `m + delay`; compute `a*` there; add `DECIDE a*` at `m + delay`; replay to completion; report realized utility, outcome, quadrant. Omit if no such `m`, or if the trainee already verified at or before `m` |
| CF_NO_LOSS | "If nothing had been lost" | Recompute belief at the decision time with all DROPPED reports delivered at issue time and all late reports delivered at issue time (`extraReports`); report belief, `a*`, EVPI, and whether `a*` differs from the actual choice |
Determinism: counterfactuals use the same engine; they never write to history.
Golden values: CF_NO_LOSS for Path B at t=26: R10 delivered at 20:00 and R11 delivered at 25:00 → belief and a* MUST be computed by the engine; test asserts `a*` ≠ GO_NORTH and p(north) < 0.5.
CF_VERIFY_EARLIER for Path B: earliest feasible `m` with net VOI ≥ 0 is at or before 24:00; the resulting `a*` MUST be GO_SOUTH and realized utility positive.

---

## 31. CALIBRATION AND PERSISTENT ANALYTICS (P2) — `AnalyticsPage.tsx`

31.1 Source: `useHistoryStore` backed by `dhundh.v1.history` (Section 14.3). No server.
31.2 Panels (each answers a training question):
| Panel | Content | Training question |
|---|---|---|
| Score trend | Training Score and DQ as two SVG polylines over the last 20 sessions | Am I improving? |
| Quadrant tiles | Counts of SOUND_SUCCESS / SOUND_UNLUCKY / LUCKY / POOR | Am I judging well or relying on luck? |
| Posture | Counts of BALANCED / OVER_COMMITTED / OVER_CAUTIOUS | Do I lean aggressive or cautious? |
| Calibration table | 5 probability bins: n, mean stated probability, observed frequency of truth; "not enough data" if n < 3 | Are my stated probabilities calibrated? (aggregate only) |
| Verification habits | % of sessions where verification was worth it and used / skipped | Do I seek information when it pays? |
| Patterns (rule-based) | e.g., "Over-cautious in 3 of your last 5 sessions", "Skipped worthwhile verification in 2 of 4 sessions", "Opened under 60% of evidence weight in 3 sessions" | What should I fix? |
31.3 Pattern rules are deterministic thresholds on the last 5 sessions; maximum 3 patterns shown; each pattern links to the relevant session AAR (if logs retained).
31.4 CSV export of history (`history.csv`).
31.5 Empty state: "No completed sessions yet. Run the flagship scenario to start your history." with a button.
31.6 Honesty note under calibration table: "Calibration claims need many decisions. This table is a diagnostic, not proof of improvement."

---

## 32. DATA STRATEGY AND SYNTHETIC DATA

| Data class | Used? | Treatment |
|---|---|---|
| Real operational/military data | NO | Never used; none claimed |
| Historical datasets | NO | None |
| Synthetic scenario content | YES (all) | Authored JSON; labelled `SYNTHETIC SCENARIO` in UI footer, briefing, AAR, exports |
| Simulated feeds | YES | Degradation engine; labelled "Simulated link degradation" |
| User-generated data | Session logs and history | Browser-local only; never uploaded |
| External APIs | NONE for P0–P2 | P3 narration only (optional) |
32.1 The UI footer on every scenario screen reads: `SYNTHETIC SCENARIO — fictional entities. Reliabilities and payoffs are authoring assumptions, not doctrine.`
32.2 No map tiles, no external fonts, no CDN scripts. All assets are bundled.
32.3 Dataset provenance statement for the PPT: "No real data. The system's value is the evaluation method; scenarios are synthetic and replaceable by instructor-authored content."

---

## 33. API, WEBSOCKET AND SESSION CONTRACTS

### 33.1 REST (Express; JSON; all errors use `{ "error": { "code": string, "message": string } }`)
| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `200 { "status": "ok", "version": string, "uptimeSec": number, "sessions": number }` | — |
| GET | `/api/scenarios` | — | `200 [{ id, title, subtitle, difficulty, summary, tags, durationMin }]` | — |
| POST | `/api/sessions` | `{ scenarioId: string, seed?: number, difficultyLevel?: 1..5, aidMode?: "ALWAYS"\|"AFTER_ESTIMATE" }` | `201 { code, clientId, token, role: "INSTRUCTOR", scenarioId, seed, difficultyLevel }` | `400 INVALID_BODY`, `404 UNKNOWN_SCENARIO`, `429 TOO_MANY_SESSIONS` or `429 RATE_LIMITED` |
| GET | `/api/sessions/:code` | — | `200 { code, scenarioId, phase, roster: [{ role, name, connected }], createdAtIso }` | `404 SESSION_NOT_FOUND` |
| GET | `/api/sessions/:code/aar` | `Authorization: Bearer <session-token>` | `200 Aar` | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SESSION_NOT_FOUND`, `409 NOT_COMPLETE` |
| POST | `/api/aar/narrate` (P3) | `{ aar: AarSummary }` | `200 { text: string }` | `501 NARRATION_DISABLED`, `502 UPSTREAM_ERROR` |
Example:
```http
POST /api/sessions
{ "scenarioId": "kestrel-relief-corridor", "difficultyLevel": 3, "aidMode": "ALWAYS" }

201 { "code": "K7QF2M", "clientId": "7f3c…", "token": "b19e…", "role": "INSTRUCTOR",
      "scenarioId": "kestrel-relief-corridor", "seed": 0, "difficultyLevel": 3 }
```
Rate limits: 30 requests/min/IP on `POST /api/sessions` (in-memory token bucket). `seed` default 0 (canonical). Tokens: `crypto.randomUUID()` hex without dashes.

### 33.2 `SessionView` (sent to clients; defined in `src/session/protocol.ts`)
```ts
export interface SessionView {
  seq: number; role: RoleId; phase: Phase; nowSec: SimSeconds; speedSecPerMin: number;
  scenario: { id: string; title: string; subtitle: string; summary: string; briefing: string[]; durationSec: SimSeconds; difficultyLevel: number };
  hypotheses: { id: HypothesisId; label: string; trueLabel: string; falseLabel: string; primary: boolean }[];   // NO prior/initialTruth for non-instructor
  channels: { id: ChannelId; label: string; sourceLabel: string; health: ChannelHealth; lastDeliveredAtSec: SimSeconds | null; visible: boolean; detail?: string /* instructor only */ }[];
  reports: ReportView[];
  belief: BeliefSnapshot | null; beliefHidden: boolean;
  decisionPoint: null | {
    id: string; title: string; prompt: string; openSec: SimSeconds; closeSec: SimSeconds; status: 'UPCOMING' | 'OPEN' | 'CLOSED';
    actions: { id: ActionId; label: string; description: string; payoffs: { when: string; value: number }[] }[];
    assets: { id: AssetId; label: string; delaySec: SimSeconds; costUnits: number; gradeLabel: 'A'|'B'|'C'; usesLeft: number; feasible: boolean; reasonDisabled?: string }[];
    requiredEstimates: HypothesisId[]; delayCostPerMin: number; departureSec: SimSeconds;
  };
  myEstimates: EstimateRecord[]; myInspected: ReportId[];
  verifications: { assetId: AssetId; requestedAtSec: SimSeconds; deliversAtSec: SimSeconds; resultReportId: ReportId | null }[];
  decisions: { atSec: SimSeconds; actionId: ActionId; role: RoleId; timedOut: boolean }[];
  advice: { atSec: SimSeconds; actionId: ActionId; note?: string }[];
  relayCapacityLeft: number;
  roster: { role: RoleId; name: string; connected: boolean }[];
  consequence?: { headline: string; narrative: string; revealAtSec: SimSeconds };
  truth?: Record<HypothesisId, boolean>;                       // COMPLETE or INSTRUCTOR only
  instructor?: { diagnostics: { eu: Record<ActionId, number>; bestActionId: ActionId; isTie: boolean; evpi: number; assets: { id: AssetId; evsi: number; netVoi: number }[] }; inTransit: ReportView[]; dropped: ReportView[]; eventLog: { atSec: SimSeconds; text: string }[]; traineeSnapshots: { role: RoleId; opened: number; delivered: number; lastOpened: ReportId | null; estimate: number | null; decided: boolean }[] };
  aidMode: 'ALWAYS' | 'AFTER_ESTIMATE'; aidRevealed: boolean; aarReady: boolean;
  engineError?: { code: string; message: string };            // last rejected intent for this client
}
export interface ReportView {
  id: ReportId; channel: ChannelId; claim: string; detail: string | null /* null until opened by this role */; rho?: number /* instructor/COMPLETE only */; gradeLabel: 'A'|'B'|'C'|'D';
  stance?: Stance /* omitted for trainees before COMPLETE; included for INSTRUCTOR/COMPLETE */; hypothesisId: HypothesisId | null;
  issuedAtSec: SimSeconds; deliveredAtSec: SimSeconds | null; status: ReportStatus; origin: 'SCENARIO'|'INJECT'|'VERIFY'|'RELAY';
  badges: ('DELAYED'|'STALE'|'RELAYED'|'UNCONFIRMED'|'VERIFIED'|'NEW')[]; evidenceGroup: string; relayedFrom?: { role: RoleId; atSec: SimSeconds; note?: string };
  effectiveAccuracy: number | null; contributionNats: number | null; weight: number | null; contradicts: ReportId[];
}
```
Important: trainees DO see which hypothesis a report concerns (so the feed is readable) and the engine's per-report contribution after they open it. Stance is NOT sent as a field for trainees before COMPLETE, but `contributionNats` (signed) is sent once the report is opened (the sign reveals stance after reading; this is intended).

### 33.3 WebSocket protocol (`/ws`; JSON text frames; validated with zod in `src/session/protocol.ts`)
Client → server:
```ts
type ClientMsg =
  | { type: 'HELLO'; code: string; role: 'COMMANDER'|'ANALYST'|'INSTRUCTOR'; name: string; clientId?: string; token?: string }
  | { type: 'INTENT'; intent: ClientIntent }      // ClientIntent = Intent without `t` and `role`
  | { type: 'PING'; ts: number };
```
Server → client:
```ts
type ServerMsg =
  | { type: 'WELCOME'; clientId: string; token: string; role: RoleId; view: SessionView }
  | { type: 'VIEW'; view: SessionView }
  | { type: 'ERROR'; code: 'SESSION_NOT_FOUND'|'ROLE_TAKEN'|'BAD_TOKEN'|'BAD_MESSAGE'|'RATE_LIMITED'|'FORBIDDEN'|'SESSION_FINISHED'; message: string }
  | { type: 'PONG'; ts: number };
```
Rules: first message MUST be `HELLO` within 5 s or the server closes with code 4001. A new binding without a valid token may request only `COMMANDER` or `ANALYST`. `INSTRUCTOR` is reserved for the `clientId`+`token` pair returned by `POST /api/sessions`; a HELLO that declares `INSTRUCTOR` without that server-issued credential MUST return `FORBIDDEN`. `HELLO` with a valid `clientId`+`token` rebinds the existing role. Intent rejections do not close the socket: the next `VIEW` carries `engineError`. Ordering: the server processes messages per client in arrival order; views carry `seq`. Heartbeat: client `PING` every 20 s; server drops connections silent for 60 s. Max message size 8 KB.

---

## 34. JSON EXAMPLES (contract fixtures; also used in tests)

34.1 Report (ReportView, trainee, after opening R06 at t=22:30):
```json
{ "id": "R06", "channel": "LAND", "claim": "Patrol: rockfall observed near Veer Pass entrance",
  "detail": "A patrol vehicle saw fresh rockfall near the pass entrance and turned back before reaching it. The report was queued while the link was degraded.",
  "rho": 0.75, "gradeLabel": "B", "hypothesisId": "north_pass", "issuedAtSec": 960, "deliveredAtSec": 1320,
  "status": "DELIVERED", "origin": "SCENARIO", "badges": ["DELAYED"], "evidenceGroup": "G6",
  "effectiveAccuracy": 0.6852, "contributionNats": -0.7778, "weight": 1.0, "contradicts": ["R01", "R02", "R04"] }
```
34.2 Event (scenario): `{ "kind": "CHANNEL_DEGRADE", "atMin": 16, "channel": "LAND", "mode": "DELAY", "extraDelayMin": 6, "untilMin": 26, "note": "…" }`.
34.3 Action (view): `{ "id": "GO_NORTH", "label": "Take the north route (Veer Pass)", "description": "…", "payoffs": [{ "when": "Veer Pass passable", "value": 100 }, { "when": "Veer Pass blocked", "value": -80 }] }`.
34.4 Consequence: `{ "headline": "Convoy halted at the Veer Pass debris field", "narrative": "…", "revealAtSec": 1800 }`.
34.5 Scoring block of the AAR for Path A:
```json
{ "dq": 1.0, "outcome": 0.6975, "infoUtil": 0.9481, "timeliness": 0.3889, "verifyEff": 1.0, "calibration": 0.9795,
  "trainingScore": 88.47, "quadrant": "SOUND_SUCCESS", "realizedUtility": 39.5, "brierUser": 0.0625, "brierSystem": 0.0575 }
```
34.6 Decision record: `{ "decisionPointId": "DP1", "atSec": 1740, "actionId": "GO_SOUTH", "role": "SOLO", "timedOut": false, "rationale": { "text": "Rockfall report plus the sortie result outweigh the stale clear reports.", "citedReportIds": ["R06", "V01"], "tags": ["WEIGHED_CONTRADICTION", "AWAITED_VERIFICATION"] }, "estimates": { "north_pass": 0.25 }, "consultedAid": true }`.
34.7 Session log: `{ "logVersion": 1, "scenarioId": "kestrel-relief-corridor", "scenarioVersion": 1, "scenarioHash": "<fnv1a hex>", "seed": 0, "difficultyLevel": 3, "aidMode": "ALWAYS", "intents": [ { "type": "START", "t": 0 }, … ] }`.

---

## 35. SECOND SCENARIO (P2): `harbour-flood-response` (exact design; agent writes the JSON)

Purpose: prove the engine is scenario-agnostic and exercise two decision points. Fictional port city "Port Anand".
### 35.1 Design table
| Element | Definition |
|---|---|
| Hypotheses | `quay_dry` (prior 0.65, primary, initialTruth true → becomes false at 10:00), `ridge_road_open` (prior 0.75, initialTruth true) |
| Channels | LAND (τ 20), AIR (τ 15), CYBER (τ 25), EW (τ 30) with same `visibleTo` as flagship |
| Events | TRUTH_CHANGE quay_dry=false at 10:00; LAND BURST 12:00→20:00 (reports issued in window arrive together at 20:00); CYBER NOISE (m=0.5) 14:00→22:00; AIR DELAY +4 15:00→24:00; EW DROPOUT 18:00→21:00 |
| Reports (≥ 12) | LAND×4, AIR×3, CYBER×3, EW×2 (≥ 1 informational); at least two evidence groups with two reports each to exercise the group rule; at least two contradicting pairs on `quay_dry` |
| Assets | `DRONE_SWEEP` (north quay; ρ 0.92; delay 5; cost 4), `GAUGE_CHECK` (ridge road; ρ 0.88; delay 4; cost 3) |
| DP1 (12:00–26:00, departure 12:00, delay cost 1.2/min) | Actions `POSITION_QUAY`, `POSITION_RIDGE`, `HOLD_POSITION` (cautious/timeout). Utilities: quay: +90 if quay_dry else −70; ridge: +60 if ridge_road_open else −60; hold: +8 |
| DP2 (28:00–38:00, departure 28:00, delay cost 1.0/min) | Actions `ROUTE_VIA_QUAY`, `ROUTE_VIA_RIDGE`, `HOLD_ROUTE`; same hypotheses; utilities +80/−60, +55/−55, +5; requiredEstimates: `quay_dry` |
| Duration | 45 min |
### 35.2 Engine support required for two DPs
Per-DP verification capacity resets at each DP; `currentDecisionPointIndex` advances on a valid non-last DECIDE; `Aar.decision` becomes `decisions[]` for scenarios with more than one DP: implement `Aar.decisions: AarDecision[]` and keep `Aar.decision` as the LAST decision for flagship-compatible UI. Scores are computed per DP and averaged (mean) for the composite.
### 35.3 Tests
Loader invariants pass; a scripted two-decision path produces finite scores; `mutateScenario` gates pass for seeds 1..50 at levels 2–4.

---
---

## 36. VISUAL DESIGN SYSTEM — IMPLEMENTATION TOKENS AND BEHAVIOR

### 36.1 Visual objective

The product MUST look like a serious decision-support training product rather than:

- a generic SaaS dashboard
- a gaming UI
- a student portfolio
- a military-themed skin over a dashboard

The visual system should communicate:

> controlled complexity, information pressure, explainability, and operational seriousness.

The interface MUST remain fictional and non-operational.

### 36.2 Design language

Use a dark-neutral command-console foundation with restrained semantic accents.

Primary design qualities:

- high information density
- disciplined spacing
- clear hierarchy
- low-noise surfaces
- strong temporal cues
- subtle motion
- readable numerical data
- visible state transitions
- no decorative clutter

Do NOT use:

- glowing neon everywhere
- excessive glassmorphism
- gratuitous gradients
- giant hero illustrations on the operational screens
- excessive rounded cards
- arcade-style HUD widgets

### 36.3 Global color tokens

CREATE these CSS custom properties in `src/styles/tokens.css`.

```css
:root {
  --bg-0: #081015;
  --bg-1: #0d161c;
  --bg-2: #121e25;
  --bg-3: #18262f;

  --surface-0: #0d161c;
  --surface-1: #111c23;
  --surface-2: #16232c;
  --surface-elevated: #1a2a34;

  --border-subtle: rgba(224, 239, 244, 0.08);
  --border-default: rgba(224, 239, 244, 0.14);
  --border-strong: rgba(224, 239, 244, 0.22);

  --text-strong: #eef6f8;
  --text-default: #d3dfe3;
  --text-muted: #92a5ad;
  --text-faint: #667a83;

  --accent-cyan: #4fd1c5;
  --accent-blue: #64a5ff;
  --accent-amber: #f2b45d;
  --accent-red: #ef7474;
  --accent-green: #70d6a4;
  --accent-violet: #a78bfa;

  --state-healthy: var(--accent-green);
  --state-degraded: var(--accent-amber);
  --state-down: var(--accent-red);
  --state-info: var(--accent-blue);
  --state-unknown: var(--text-muted);
  --state-contradiction: var(--accent-violet);

  --shadow-elevated: 0 12px 32px rgba(0, 0, 0, 0.20);
}
```

The exact values may be refined only if contrast testing demonstrates a failure.

### 36.4 Semantic state encoding

Every status MUST be encoded using:

1. text
2. icon or pattern
3. color

Examples:

- HEALTHY → “Healthy” + check icon + green
- DEGRADED → “Degraded” + warning icon + amber
- DOWN → “Down” + slash/warning icon + red
- CONTRADICTION → “Evidence conflicts” + split/alert icon + violet
- UNKNOWN → “Unknown” + question icon + neutral

Never use color alone.

### 36.5 Fog Veil

Implement the `Fog Veil` effect on low-weight information.

The effect is NOT a CSS blur applied so strongly that text becomes inaccessible.

For each report card:

```text
opacity = 0.72 + 0.28 * evidenceWeight
```

where evidenceWeight is [0,1].

Use:

- lower contrast on low-weight reports
- reduced metadata emphasis
- optional 1 px text shadow suppression
- no accessibility-breaking blur

For high fog:

- low-weight reports recede visually
- high-weight reports remain legible
- all information remains accessible

The Fog Veil is an information-priority visualization, not a hiding mechanism.

### 36.6 Evidence Waterfall

Implement as hand-written SVG.

Requirements:

- one horizontal row per contributing evidence group
- anchor line at prior log-odds
- positive contribution extends right
- negative contribution extends left
- report ID displayed at readable density
- hover/focus reveals:
  - report ID
  - claim
  - source grade
  - age
  - effective accuracy
  - contribution
  - evidence group

Use SVG only.

No chart library.

### 36.7 Contradiction visualization

Implement two opposing contribution rails:

```text
SUPPORTS TRUE  ────────────────●
                               │
                         CONFLICT
                               │
SUPPORTS FALSE ───────────●────
```

Render the actual weighted masses as opposing arcs or bars.

The visualization MUST communicate:

> “The evidence is split.”

It MUST NOT communicate:

> “The system is wrong.”

### 36.8 Fog Meter

The Fog Meter is a normalized entropy display.

Display:

```text
FOG
72%
HIGH UNCERTAINTY
```

Tooltip:

> “Average uncertainty across hypotheses. 0% = certain, 100% = coin flip.”

Avoid implying that “high fog” means low-quality information in every circumstance.

### 36.9 Typography

Use:

- IBM Plex Sans for operational UI
- IBM Plex Serif only for section headings or explanatory model copy

Scale:

```text
Display:  30px / 1.1 / 600
H1:       24px / 1.2 / 600
H2:       18px / 1.25 / 600
H3:       15px / 1.3 / 600
Body:     14px / 1.5 / 400
Small:    12px / 1.4 / 400
Label:    11px / 1.2 / 600
Metric:   28px / 1.0 / 600
```

Uppercase labels MUST use 0.06em letter spacing.

### 36.10 Spacing

Use 4px base increments.

```text
4
8
12
16
20
24
32
40
48
64
```

Critical console panels use:

- 16–24px internal padding
- 12px panel gaps
- 8px control gaps

### 36.11 Borders and radius

Use:

```text
panel radius: 10px
card radius: 8px
button radius: 7px
badge radius: 999px
```

Borders are subtle.

Avoid heavily rounded “mobile app” aesthetics.

### 36.12 Elevation

Use only two elevation levels:

```text
surface
surface-elevated
```

Shadow should be minimal and tokenized:

```css
box-shadow: var(--shadow-elevated);
```

No shadow on every child component.

### 36.13 Motion principles

Motion exists to communicate:

- information arrival
- degradation
- transition
- focus
- state change
- consequences

Default duration:

```text
micro: 120ms
standard: 180–220ms
state transition: 280–360ms
reveal: 360–450ms
```

Use a decelerating ease-out for incoming information.

Use a controlled ease-in-out for panel state changes.

Reduced motion MUST remove non-essential animation.

### 36.14 Information arrival animation

When a new report arrives:

1. insert card at top
2. show NEW marker
3. animate a 160ms vertical translation
4. briefly emphasize channel indicator
5. update channel health sparkline
6. update belief state
7. animate belief delta over 250ms

The animation MUST NOT delay the engine update.

### 36.15 Degradation animation

When communication degrades:

- channel strip changes state
- a narrow banner appears:
  > “LAND link degraded”
- pending reports visually show transit state
- no catastrophic screen shake
- no audio requirement

### 36.16 Decision commit animation

On commit:

1. lock decision controls
2. preserve the rationale
3. show chosen action
4. transition to consequence state
5. start consequence timer

No undo after a terminal decision.

### 36.17 Design-system acceptance criteria

- All components use tokenized colors.
- No hard-coded colors outside tokens except SVG semantic calculations.
- All interactive elements have focus states.
- Color contrast passes WCAG 2.1 AA for normal text.
- Reduced-motion mode disables non-essential animation.
- Semantic state can be understood without color.

---

## 37. COMPONENT SYSTEM — EXACT UI PRIMITIVES

### 37.1 Component architecture

CREATE hand-written reusable primitives under:

```text
src/components/ui/
```

The primitives MUST be domain-agnostic.

Domain-specific UI belongs under:

```text
src/features/<feature>/
```

### 37.2 `Button.tsx`

Props:

```ts
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}
```

Behavior:

- button element by default
- disabled semantics
- loading state retains dimensions
- accessible label required when icon-only
- keyboard support native

### 37.3 `Badge.tsx`

Props:

```ts
interface BadgeProps {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';
  icon?: React.ReactNode;
  children: React.ReactNode;
}
```

Use for:

- DELAYED
- STALE
- RELAYED
- VERIFIED
- NEW
- SYNTHETIC

### 37.4 `Card.tsx`

Props:

```ts
interface CardProps {
  interactive?: boolean;
  selected?: boolean;
  subdued?: boolean;
  children: React.ReactNode;
}
```

Interactive cards MUST expose selected state through:

- border
- outline
- aria-pressed where appropriate

### 37.5 `Panel.tsx`

The main container for console modules.

Must support:

- title
- subtitle
- status slot
- action slot
- body
- footer

Header height target:

> 52–60px.

### 37.6 `Chip.tsx`

Use for compact filters and tags.

Do not use chips to represent paragraphs.

### 37.7 `Tooltip.tsx`

Requirements:

- mouse hover
- keyboard focus
- aria-describedby
- ESC dismissal if interactive
- no tooltip on disabled native buttons unless wrapped correctly

### 37.8 `Dialog.tsx`

Requirements:

- focus trap
- restore focus
- ESC close when dismissible
- inert background
- labelled title
- description
- action area

### 37.9 `Tabs.tsx`

Use real ARIA tab semantics.

Keyboard:

- ArrowLeft / ArrowRight
- Home / End
- Enter only if manual activation chosen

Default:

> automatic activation when focus moves.

### 37.10 `Slider.tsx`

Use native range where practical.

Always show:

- current value
- min
- max
- unit

### 37.11 `Kbd.tsx`

Used in shortcuts overlay.

### 37.12 `Toast.tsx`

Toasts are only for:

- non-blocking state changes
- storage warnings
- reconnect status
- copy success

Never use toast as the only error surface.

### 37.13 `ErrorBoundary.tsx`

Wrap:

- root application
- major routes
- AAR
- multiplayer route

Fallback MUST include:

- plain-language error
- retry
- reset to demo if available
- diagnostic ID in development only

### 37.14 `EmptyState.tsx`

Must include:

- concise title
- one sentence
- relevant action

Never display an empty chart without explanation.

### 37.15 UI component test rule

Every primitive MUST have:

- basic render test
- disabled/loading test where applicable
- keyboard/focus test where applicable
- accessibility assertion where practical

---

## 38. SCREEN-BY-SCREEN IMPLEMENTATION SPECIFICATION

### 38.1 Global application shell

`AppShell` MUST provide:

- top utility bar
- page content region
- route-aware navigation
- session state indicator
- network mode indicator
- synthetic-data badge
- keyboard shortcuts entry
- responsive collapse

The shell MUST NOT display:

- user profile avatars
- fake organizational logos
- “production” status
- real military insignia

### 38.2 Home Page — `/`

Purpose:

> explain the product and launch the fastest possible demo.

Above the fold:

- wordmark: DHUNDH
- subtitle: Decision Training Under Degraded Information
- one sentence explanation
- primary CTA: `RUN FLAGSHIP DEMO`
- secondary CTA: `BROWSE SCENARIOS`
- tertiary CTA: `CREATE TRAINING SESSION`

Below:

- three mechanism cards:
  - Information Fog
  - Decision-Time Scoring
  - After-Action Review

Footer:

> SYNTHETIC TRAINING ENVIRONMENT — fictional entities.

### 38.3 Home page demo CTA behavior

Clicking `RUN FLAGSHIP DEMO`:

1. loads flagship scenario locally
2. seed = 0
3. difficulty = 3
4. aidMode = ALWAYS
5. skips configuration
6. navigates to `/demo`
7. shows demo overlay

The path MUST have zero network dependencies.

### 38.4 Trainee Console — `/session/:mode/:id`

Three-column desktop layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ Session header / clock / channel status / controls           │
├───────────────┬─────────────────────────────┬───────────────┤
│ Report Feed   │ Belief + Fog + Timeline     │ Decision      │
│ 34–38% width  │ 34–40% width                │ 26–30% width  │
└───────────────┴─────────────────────────────┴───────────────┘
```

Header:

- scenario title
- synthetic badge
- clock
- phase
- speed
- reset/controls when permitted

Left:

- report feed
- filters
- unread count

Center:

- hypothesis cards
- Fog Meter
- Contradiction Meter
- Evidence Waterfall
- timeline

Right:

- decision window
- estimate
- verify
- action cards
- rationale entry

### 38.5 Trainee console responsive behavior

At <= 1100px:

- decision panel remains sticky
- center and feed reduce width
- evidence waterfall can collapse into drawer

At <= 820px:

- use tabs:
  - Evidence
  - Situation
  - Decision

Do NOT attempt to preserve a 3-column layout on narrow screens.

### 38.6 Scenario Library — `/scenarios`

Display:

- scenario cards
- difficulty
- duration
- decision count
- training focus
- synthetic badge
- last attempt
- current difficulty

Actions:

- Run
- Demo
- View briefing

P2:

- “Generate variation” button

### 38.7 Briefing Page — `/scenario/:id/briefing`

Sections:

1. Situation
2. Objectives
3. Known constraints
4. Available actions
5. Verification assets
6. Scoring explanation
7. Model disclosure
8. Start Exercise

The briefing MUST explicitly state:

> “This is a synthetic training scenario. The reference model is a transparent scoring baseline, not real doctrine.”

### 38.8 Instructor Console — `/instructor/:code`

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Session code | Status | Speed | Pause | Reset               │
├────────────────────┬─────────────────────────────────────────┤
│ Scenario controls  │ Live Monitor                            │
│ Injects            │ Trainee/role state                     │
│ Diagnostics        │ Event log                              │
└────────────────────┴─────────────────────────────────────────┘
```

Panel order:

1. session controls
2. inject controls
3. trainee monitor
4. diagnostics
5. event log

Diagnostics MUST visually separate:

> “Instructor only — not visible to trainees.”

### 38.9 Synthetic scenario badge

Every scenario screen MUST show:

> `SYNTHETIC SCENARIO — fictional entities`

Secondary provenance line:

> `Reliabilities and payoffs are authoring assumptions, not doctrine.`

This badge must appear:

- home demo
- briefing
- trainee console
- instructor console
- AAR
- exports
- presentation mode

### 38.10 Join Page — `/join`

Fields:

- session code
- display name
- role

Role options:

- Commander
- Analyst

No password.

Validation:

- code exactly 6 uppercase alphanumeric characters
- name 2–40 characters

### 38.11 Lobby — `/lobby/:code`

Display:

- session code
- roster
- connection state
- selected scenario
- difficulty
- “waiting for instructor”

The analyst and commander can see one another only by role/name/status.

### 38.12 AAR Page — `/aar/:id`

AAR hierarchy:

1. result headline
2. score + quadrant
3. one-sentence decision summary
4. Knew vs Truth vs Never Saw
5. decision timeline
6. verification analysis
7. evidence waterfall
8. counterfactuals
9. coach notes
10. team section
11. model limitations
12. export controls

The top of the page MUST answer:

> “Was the decision good given the information available?”

before showing secondary metrics.

### 38.13 AAR decision quadrant

Create a 2×2 visual:

```text
                        GOOD OUTCOME
                              ↑
          SOUND SUCCESS       |       LUCKY
                              |
SOUND DECISION  ──────────────┼──────────────
                              |
          SOUND UNLUCKY       |       POOR
                              |
                              ↓
                       BAD OUTCOME
```

The axis labels MUST make the distinction clear:

- horizontal: decision quality
- vertical: outcome

### 38.14 Analytics — `/analytics`

Cards:

- Training Score trend
- DQ trend
- Quadrants
- Posture
- Calibration
- Verification habits
- Patterns

Each card needs:

- title
- metric
- interpretation
- time range

No fake growth percentage.

### 38.15 About / Model Drawer

Available from:

- trainee console
- briefing
- AAR

Contains:

- formulas
- assumptions
- limitations
- synthetic-data statement
- scoring interpretation

Use progressive disclosure.

### 38.16 Authoring Page — `/authoring`

P3 only.

Layout:

- JSON editor
- schema errors
- scenario preview
- validation status
- save/export

Never expose server filesystem operations to the browser.

Authoring only manipulates client-side scenario JSON.

### 38.17 Presentation Mode

Route:

`/presentation/:mode/:id`

Characteristics:

- fullscreen
- larger metrics
- simplified navigation
- only essential panels
- strong contrast
- no developer chrome

---

## 39. DEMO MODE — DETERMINISTIC JUDGING EXPERIENCE

### 39.1 Objective

Demo Mode is the highest-priority presentation surface.

It must guarantee:

> repeatable behavior.

### 39.2 Demo start

User selects:

> RUN FLAGSHIP DEMO

The app loads:

```text
scenario = kestrel-relief-corridor
seed = 0
difficulty = 3
aidMode = ALWAYS
mode = LOCAL
```

### 39.3 Demo overlay

The overlay should guide the presenter:

```text
STEP 1
Read the information.

STEP 2
Watch the communications degrade.

STEP 3
Evaluate uncertainty.

STEP 4
Make the decision.

STEP 5
Inspect the AAR.
```

The overlay can be dismissed.

### 39.4 Automated demonstration timeline

The demo controller MUST support:

- start
- pause
- resume
- reset
- step-forward
- skip-to-WOW
- skip-to-decision
- skip-to-AAR

These controls are presenter-only.

### 39.5 First WOW target

The first WOW should happen by approximately 60 seconds of wall time.

Target event:

> contradiction + Fog Index spike + altered belief.

### 39.6 Presenter-safe behavior

If the presenter makes an unexpected decision:

- the engine remains correct
- the demo still reaches AAR
- the AAR adapts to the actual path

Do NOT hard-code a fake final score.

### 39.7 Demo reset guarantee

Reset MUST:

- cancel timers
- clear local engine state
- create fresh deterministic state
- clear transient UI state
- return to briefing/console according to entry path

Target:

> < 3 seconds.

### 39.8 Demo recovery hotkeys

```text
H = home
D = reset demo
N = skip to next scripted event
J = jump to decision
A = open AAR
I = toggle instructor drawer
? = shortcuts
```

Presenter hotkeys MUST be documented in `DemoPage`.

---

## 40. ACCESSIBILITY, KEYBOARD, AND INTERACTION SYSTEM

### 40.1 Accessibility target

Target:

> WCAG 2.1 AA for the judge-facing desktop experience.

### 40.2 Focus order

Trainee console:

1. header
2. scenario state
3. report filters
4. report feed
5. hypothesis panel
6. evidence waterfall
7. verification
8. decision actions
9. rationale

### 40.3 Keyboard shortcuts

Trainee:

```text
J/K     move report selection
Enter   open/close report
E       focus estimate
L       log estimate
V       focus verification
D       focus decision
Esc     close dialog
?       shortcuts
```

Instructor:

```text
Space   pause/resume
1–5     inject preset
R       reset
T       truth
M       diagnostics
?       shortcuts
```

### 40.4 Screen reader semantics

Each report card MUST expose:

- channel
- claim
- status
- delivery age
- reliability grade
- contradiction status

Example accessible summary:

> “LAND report R06. Patrol reports fresh obstruction. Delivered 6 minutes after issue. Reliability grade B. Contradicts reports R01 and R02.”

### 40.5 Reduced motion

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

Disable:

- blur/reveal animation
- non-essential transitions
- animated counters

Retain:

- state indicators
- instant updates
- focus changes

### 40.6 Keyboard decision flow

A trained presenter must be able to:

1. inspect evidence
2. enter estimate
3. task verification
4. select action
5. write rationale
6. commit

without a mouse.

### 40.7 Accessible charts

SVG visualizations MUST include:

- title
- description
- data summary

Provide a text summary below if visualization is information-critical.

---

## 41. ERROR, EMPTY, LOADING, AND DEGRADED STATES

### 41.1 Global rule

Errors MUST be understandable without developer knowledge.

Never display:

> “TypeError: Cannot read properties of undefined.”

to the user.

### 41.2 Application load failure

Show:

> “DHUNDH could not load this session.”

Actions:

- Retry
- Run Flagship Demo

### 41.3 Scenario validation failure

Developer-facing:

- exact JSON path
- error type

User-facing:

> “This scenario is invalid and cannot be started.”

### 41.4 WebSocket failure

Sequence:

1. “Reconnecting…”
2. show attempt count
3. preserve current route
4. retry using defined backoff
5. after three consecutive failures, present local fallback

### 41.5 Local fallback

Fallback CTA:

> CONTINUE LOCALLY

It loads the same:

- scenario
- seed
- difficulty

but uses `LocalSessionClient`.

### 41.6 Storage failure

If localStorage fails:

- continue current session
- disable persistent history only
- show non-blocking warning
- never block the training session

### 41.7 Export failure

Show:

> “The export could not be created. The report remains available on screen.”

Do not lose the AAR.

### 41.8 Loading state rules

Never display a blank white/black page.

Every async panel must have:

- skeleton
- text fallback
- timeout state

### 41.9 Empty state rules

Scenario library:

> “No scenarios are available.”

Analytics:

> “No completed sessions yet.”

Team AAR:

> “Team metrics require a networked team session.”

### 41.10 Engine error state

A rejected intent MUST:

- not mutate state
- attach `engineError`
- show a human-readable reason
- clear automatically after a successful intent

---

## 42. DEPLOYMENT — LOCAL, RENDER, AND STATIC FALLBACK

### 42.1 Architecture

Primary deployment:

> Render Web Service

Fallback:

> Vercel static build using local mode only.

Render supports inbound WebSocket connections for web services and documents Express + `ws` as a valid pattern. Public WebSocket clients MUST use `wss://`. The service MUST bind to the `PORT` environment variable and `0.0.0.0`. 

### 42.2 Local development

Commands:

```bash
npm install
npm run validate:scenarios
npm run test
npm run dev
```

Expected:

- Vite on 5173
- Express/ws on 8787
- proxy routes configured

### 42.3 Production build

Required sequence:

```bash
npm run validate:scenarios
npm run test
npm run typecheck
npm run build
```

No deployment if any command fails.

### 42.4 Render startup

The server MUST:

```ts
const port = Number(process.env.PORT ?? 8787);
server.listen(port, '0.0.0.0');
```

### 42.5 WebSocket path

Use:

```text
/ws
```

Public production:

```text
wss://<service>.onrender.com/ws
```

Local:

```text
ws://localhost:8787/ws
```

### 42.6 Health endpoint

`GET /health`

Response:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptimeSec": 123,
  "sessions": 2
}
```

Health endpoint MUST NOT expose:

- environment secrets
- tokens
- scenario truth
- client identifiers

### 42.7 Render service configuration

CREATE `render.yaml` with exactly:

```yaml
services:
  - type: web
    name: dhundh
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: SESSION_TTL_MINUTES
        value: "360"
      - key: MAX_SESSIONS
        value: "50"
```

Do not commit API secrets. Do not hardcode a Render plan; choose the project-appropriate plan in the deployment UI.

### 42.8 Vercel fallback

The static fallback MUST build without `server/`.

Set:

```text
VITE_FORCE_LOCAL=1
```

Behavior:

- networked session UI hidden
- local scenarios remain functional
- Demo Mode remains fully functional

### 42.8a Vercel SPA rewrite

CREATE `vercel.json` exactly:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This is required because `createBrowserRouter` uses client-side routes. Direct navigation to `/demo`, `/scenario`, `/aar`, or `/analytics` MUST not return a platform 404 on the static fallback.

### 42.9 Demo deployment strategy

Before judging:

1. open the Render URL
2. hit `/health`
3. open the flagship demo
4. run the flagship scenario once
5. reset
6. verify AAR
7. test export
8. if multiplayer is required, test two browser windows
9. keep the Render URL warm shortly before the demo

### 42.10 Deployment fallback matrix

| Failure | Fallback |
|---|---|
| Render unavailable | Vercel local mode |
| WebSocket unavailable | LocalSessionClient |
| External service failure | None required |
| Browser storage failure | Current-session memory only |
| LLM unavailable | Deterministic AAR coach |
| Scenario parse failure | Build fails before deployment |

### 42.11 Deployment acceptance

- `/health` returns 200.
- Home page loads.
- Demo works without network after initial static assets load.
- WebSocket session can be created when server is available.
- Render uses `wss://`.
- Static fallback works without server APIs.

---

## 43. SECURITY AND PRIVACY SPECIFICATION

### 43.1 Security principle

This is a prototype.

Implement:

> proportionate security.

Do not build enterprise IAM.

### 43.2 Secrets

Never:

- commit `.env`
- expose API keys to Vite client
- include tokens in logs
- place secrets in scenario JSON

`.env.example` may contain key names only.

### 43.3 Role enforcement

Server MUST derive role from:

> validated HELLO binding.

Never trust a client-supplied role inside an intent.

### 43.4 Truth redaction

Before COMPLETE:

- trainee clients MUST NOT receive truth
- analyst cannot see commander-only channels
- commander cannot see analyst-only channels
- instructor can see truth

### 43.5 Input validation

Validate:

- route params
- session codes
- names
- scenario IDs
- WebSocket message size
- role
- intent fields
- rationale length
- cited report count
- relay note length

### 43.6 Origin policy

Use `ALLOWED_ORIGINS`.

If empty in local development:

- allow localhost only.

In production:

- allow deployed frontend origin.

Reject unexpected Origin where the browser supplies it.

### 43.7 Session-token handling

Tokens:

- generated by server
- random
- sufficient length
- stored only in client local storage/session storage as designed
- never rendered in UI
- never logged

### 43.8 Rate limiting

Apply:

- REST session creation rate limit
- WebSocket intent rate limit
- HELLO timeout

### 43.9 Reconnect security

A reconnect is allowed only when:

```text
clientId + token + sessionCode
```

match an active binding.

### 43.10 REST AAR authorization

The `/api/sessions/:code/aar` endpoint MUST require a valid session token bound to that active session. The token may belong to the instructor or a participant role for that session. Invalid/missing tokens return `401`; a valid token for another session returns `403`. Do not treat knowing the six-character session code as authorization.

### 43.11 Export privacy

Exports include only session data relevant to training.

Never include:

- server secrets
- session tokens
- client network addresses
- internal diagnostics hidden from trainees

### 43.12 LLM privacy

If P3 narration is enabled:

- send only AAR summary
- never send secrets
- never send connection metadata
- label generated narrative as optional
- score never comes from LLM

---

## 44. PERFORMANCE ENGINEERING

### 44.1 Principles

Prioritize:

1. engine correctness
2. stable UI
3. fast interaction
4. low bundle weight

### 44.2 Engine budget

Flagship `advanceTo`:

> <= 15 ms

Full replay:

> <= 100 ms

AAR generation:

> <= 150 ms

### 44.3 UI tick rate

The simulation clock should update visually at:

> 4 Hz maximum in local mode

Networked view updates:

> 2 Hz maximum

### 44.4 Rendering strategy

Do NOT re-render the entire report feed on every clock tick.

Use:

- memoized report cards
- derived selectors
- stable props
- `React.memo` where useful

### 44.5 Large lists

Current scenarios have small report counts.

Do NOT add virtualization libraries unless measured need appears.

### 44.6 SVG performance

Evidence waterfall:

- cap visible contributions to current contributing evidence groups
- do not create thousands of SVG nodes
- animate only changed values

### 44.7 Bundle strategy

Avoid:

- chart frameworks
- icon packs beyond lucide-react
- animation frameworks
- utility mega-libraries

### 44.8 Code splitting

Lazy load:

- Analytics
- Authoring
- AAR
- Instructor
- Lobby

Do NOT code-split Demo Mode.

### 44.9 WebSocket payload target

Keep SessionView below:

> 40 KB

Compressing snapshots is unnecessary unless measured payloads exceed target.

### 44.10 Memory

Server sessions:

- TTL 6 hours
- max 50 sessions
- bounded event logs
- bounded client roster

Client history:

- 50 summaries
- 20 full logs

### 44.11 Performance instrumentation

In development include:

- engine timing
- AAR timing
- replay timing
- snapshot size

Do not expose diagnostics by default in production trainee view.

---

## 45. TESTING ARCHITECTURE

### 45.1 Test pyramid

Required:

```text
Many unit tests
↓
Engine integration tests
↓
Scenario/golden tests
↓
UI component tests
↓
Few critical E2E tests
```

### 45.2 Unit-test target areas

Create tests for:

- RNG
- time conversion
- scenario validation
- event ordering
- degradation
- belief
- contradiction
- entropy
- decision
- VOI
- scoring
- calibration
- AAR
- replay
- counterfactual
- mutation
- difficulty
- view redaction

### 45.3 Golden tests

The flagship golden test MUST compare:

- belief snapshots
- contradiction index
- EVPI
- EVSI
- Net VOI
- DQ
- Outcome
- composite score
- quadrant

### 45.4 Determinism tests

Same:

```text
scenario
+
seed
+
ordered intents
```

MUST produce equivalent runtime state.

Exclude wall-clock metadata.

### 45.5 Invariant tests

Test:

- probability in [0,1]
- entropy in [0,1]
- scores in [0,1]
- training score in [0,100]
- finite utility
- no NaN
- no Infinity
- valid event ordering

### 45.6 Scenario validation tests

Each scenario MUST pass:

- schema validation
- unique IDs
- valid evidence groups
- utility coverage
- consequence coverage
- reachable decision
- valid verification
- contradiction reachability

### 45.7 Role-redaction tests

Verify:

- trainee cannot see truth
- analyst cannot see LAND/AIR direct details
- commander cannot see CYBER/EW direct details
- instructor sees diagnostics
- truth appears at COMPLETE

### 45.8 WebSocket tests

Test:

- HELLO
- session-not-found
- role-taken
- bad token
- malformed payload
- reconnect
- disconnect
- intent ordering
- sequence numbers
- heartbeat

### 45.9 E2E tests

Minimum P2 tests:

1. launch app
2. run flagship demo
3. degrade channel
4. make decision
5. open AAR
6. verify AAR renders
7. create network session
8. join commander
9. join analyst
10. relay report
11. complete session

### 45.10 Export tests

Verify:

- JSON parses
- CSV headers
- CSV row counts
- printable view excludes navigation
- provenance is included

### 45.11 Accessibility tests

Use automated checks where practical.

Manually validate:

- keyboard-only flow
- focus trap
- accessible chart summaries
- contrast
- reduced motion

### 45.12 Regression command sequence

Before each major feature gate:

```bash
npm run validate:scenarios
npm run test
npm run typecheck
npm run build
```

At P2:

```bash
npm run e2e
```

---

## 46. BUILD PRIORITY CLARIFICATION — P0/P1/P2/P3

### 46.1 P0 — Safe Core

P0 is complete when all exist. Where the P0 console needs a belief display, it may use the foundational belief primitive defined by Section 22, but the full signature-grade reliability/evidence-group/contradiction model remains a P1 gate. Similarly, P0 verification means the verification action can be tasked and its result can arrive; EVSI/Net-VOI analysis remains P1.

- home
- scenario library
- briefing
- flagship scenario
- local engine
- event timeline
- four channels
- delay
- dropout
- contradiction
- report feed
- belief state
- Fog Index
- decision panel
- verification
- rationale
- consequence
- AAR
- deterministic demo
- synthetic-data disclosure
- golden tests

### 46.2 P1 — Signature Intelligence

P1 adds:

- reliability-weighted fusion
- age decay
- evidence groups
- contradiction index
- entropy
- reference-model drawer
- evidence waterfall
- regret
- EVPI
- EVSI
- Net VOI
- information-conditioned scoring
- counterfactual replay
- what-if delivery
- instructor controls
- deterministic replay

P1 is the main differentiation layer.

### 46.3 P2 — Competitive Edge

P2 adds:

- network sessions
- role separation
- relay mechanic
- live instructor monitor
- second scenario
- adaptive difficulty
- scenario mutation
- history
- analytics
- Playwright demo test

### 46.4 P3 — Advanced

P3 adds:

- team metrics
- scenario authoring
- optional LLM narrative (parked; not part of the committed submission target)
- presentation mode
- replay speed controls
- additional annotations

### 46.5 Feature unlock rule

A tier can begin only when the prior tier's gate is green.

**Foundational dependency exception:** a higher-tier engine primitive MAY be implemented at its minimum correctness level earlier when P0 literally depends on it (for example, a minimal belief calculation needed to display a decision state). The full signature-grade implementation remains P1 work. This is not permission to build P1 UI/features early; it is only permission to satisfy P0 dependencies without creating artificial rework.

The agent MUST NOT partially implement three P3 features before P1 is complete.

### 46.6 Advanced-feature ambition

Because the project has a buffered multi-day schedule:

> high-value difficult features SHOULD be attempted.

But:

> only after the preceding gate passes.

---

## 47. AGENT CONTROL FILES AND AUTONOMOUS DEVELOPMENT OPERATING RULES

### 47.1 Repository-wide Copilot instructions

CREATE:

```text
.github/copilot-instructions.md
```

This file MUST contain concise permanent project rules and MUST reference the master spec. The repository SHOULD also contain path-specific instruction files under `.github/instructions/` so engine and UI work receive focused rules without bloating global context.

Use:

```md
@COPILOT_MASTER_ENGINEERING_SPEC.md
```

GitHub documents repository-wide instructions in `.github/copilot-instructions.md` and agent instructions in `AGENTS.md`; Copilot CLI and related agent surfaces can discover these files. Keep the repository instruction file concise and treat the master spec as the detailed source.

### 47.2 Path-specific Copilot instructions

CREATE:

```text
.github/instructions/engine.instructions.md
.github/instructions/ui.instructions.md
```

`engine.instructions.md` MUST target `src/engine/**` and enforce pure deterministic TypeScript, no DOM/Node APIs, no wall-clock access, no uncontrolled randomness, explicit invariants, and unit tests for every exported function.

`ui.instructions.md` MUST target `src/features/**/*.tsx` and `src/components/**/*.tsx` and enforce tokenized styling, accessibility, no business logic duplication, stable data-test identifiers for demo-critical controls, and separation between view state and engine state.

### 47.3 `AGENTS.md`

CREATE:

```text
AGENTS.md
```

It MUST state:

- read master spec
- do not change architecture casually
- follow phase gates
- preserve synthetic-data disclosure
- run tests before advancing
- do not silently remove requirements

### 47.4 `docs/PROGRESS.md`

After every gate write:

```md
# Progress

## Current Gate
...

## Completed
- ...

## In Progress
- ...

## Blocked
- ...

## Tests
- ...

## Build
- ...

## Next Exact Action
- ...
```

### 47.5 Autonomous agent startup sequence

At first run:

1. inspect repository
2. read `AGENTS.md`
3. read `.github/copilot-instructions.md`
4. read master spec
5. inspect existing package/runtime
6. check Node/npm versions
7. inspect and record `git status`; NEVER discard or overwrite pre-existing user changes
8. create implementation plan internally
9. begin P0

Do not ask the user to choose between architecture alternatives.

### 47.6 Compatibility Blocker

Copilot may deviate from a locked technical choice ONLY when:

1. the chosen technology genuinely cannot run in the current environment;
2. the blocker is reproduced;
3. the exact blocker is recorded in `docs/DEPENDENCY_LOG.md`;
4. the replacement preserves the architecture contract;
5. the replacement does not increase scope materially;
6. tests are updated;
7. the build remains green.

Example:

```md
## Dependency Deviation

Package:
Original decision:
Observed blocker:
Reproduction command:
Evidence:
Replacement:
Why replacement preserves architecture:
Bundle impact:
Tests updated:
Date:
```

A personal preference is NOT a compatibility blocker.

---

## 48. SCENARIO AUTHORING AND DATA CONTRACT GOVERNANCE

### 48.1 Scenario file ownership

Scenario JSON is product data.

Do not place scenario definitions directly in React components.

### 48.2 Scenario versioning

Every scenario requires:

- id
- version
- synthetic flag
- metadata
- hash

Changes to scenario content increment version.

### 48.3 Authoring discipline

Authors MUST:

- use fictional names
- avoid real military organizations
- avoid operational procedures
- keep hypotheses binary for current engine
- maintain full utility coverage
- maintain consequence coverage

### 48.4 Content validation

`npm run validate:scenarios` MUST be run before builds.

### 48.5 Scenario registry

`src/scenarios/index.ts` exports:

```ts
export const scenarios = [
  loadScenario(kestrel),
  loadScenario(harbour),
] as const;
```

Avoid dynamic filesystem access in browser code.

### 48.6 Scenario selection

The server returns only:

- id
- title
- summary
- difficulty
- tags
- duration

The full scenario remains server-side/local as appropriate.

---

## 49. SCENARIO AUTHORING UI — P3 DETAILED SPEC

### 49.1 Scope

The authoring UI is for demonstrating extensibility, not replacing a professional CMS.

### 49.2 Sections

- metadata
- hypotheses
- channels
- reports
- events
- decision points
- actions
- assets
- scoring
- model parameters

### 49.3 Validation panel

Show:

```text
✓ Schema valid
✓ Utility coverage
✓ Consequence coverage
✓ Contradiction reachable
✓ Verification feasible
```

or specific failures.

### 49.4 Preview

Preview MUST use:

> LocalSessionClient

No server required.

### 49.5 Export

Export exact JSON format expected by loader.

### 49.6 Safety banner

Top of authoring page:

> “Synthetic training scenario editor. Do not enter real-world operational or classified content.”

---

## 50. REPORT EXPORT AND PRINT SYSTEM

### 50.1 JSON export

Output full `Aar` object.

Filename:

```text
dhundh-aar-<scenario-id>-<timestamp>.json
```

### 50.2 CSV export

Primary file:

```text
timeline.csv
```

Columns:

```text
atSec
lane
kind
summary
reportId
revealedToTrainee
```

Decision file:

```text
decisions.csv
```

Columns:

```text
role
decisionPointId
atSec
action
belief
regret
dq
outcome
trainingScore
rationaleText
citedReports
tags
```

### 50.3 Printable AAR

`window.print()`.

Paper:

> A4 portrait.

Margins:

> 12mm.

Hide:

- navigation
- interactive controls
- tooltips
- session chrome

Page break before:

- Timeline
- Counterfactuals
- Team Section

### 50.4 Export provenance

Every export MUST include:

```text
SYNTHETIC SCENARIO — fictional entities.
Reliabilities and payoffs are authoring assumptions, not doctrine.
```

### 50.5 Export honesty

Do not call generated reports:

> official training reports.

Call them:

> prototype AAR.

---

## 51. QUALITY AND COACHING LOGIC

### 51.1 Coaching objective

Coach notes must be:

- deterministic
- evidence-linked
- non-judgmental
- concise
- actionable

### 51.2 Coach evidence linking

Every note should store evidence references.

Examples:

```ts
{
  id: 'C8',
  severity: 'ATTENTION',
  text: 'You did not open R06...',
  evidence: ['R06', 'DP1']
}
```

### 51.3 Coach-note ordering

Order by:

1. ATTENTION
2. GOOD
3. INFO

Within severity:

> scenario timeline order.

### 51.4 Coach language

Avoid:

- “you failed”
- “you are bad at decisions”
- “wrong commander”

Prefer:

- “The evidence available at the time favoured…”
- “A verification was net-positive…”
- “This report carried a large share of evidence weight…”

### 51.5 Explainability

Every coach note MUST be explainable from recorded data.

---

## 52. OBSERVABILITY AND DEVELOPER DIAGNOSTICS

### 52.1 Development diagnostics

Include a developer-only panel controlled by:

```text
?debug=1
```

Do not expose it in normal Demo Mode.

### 52.2 Diagnostics

Show:

- engine step duration
- render count
- replay duration
- current seq
- session mode
- WebSocket state
- last intent
- last engine error

### 52.3 Server logs

Structured events:

```text
SESSION_CREATED
CLIENT_CONNECTED
CLIENT_RECONNECTED
INTENT_ACCEPTED
INTENT_REJECTED
SESSION_COMPLETED
SESSION_EXPIRED
SERVER_ERROR
```

### 52.4 Log discipline

Do not log:

- tokens
- hidden truth in trainee sessions
- complete rationale if avoidable
- unnecessary personal data

### 52.5 Error IDs

Every unexpected server error should have:

> short error ID

for troubleshooting.

---

## 53. GIT WORKFLOW AND RECOVERY POINTS

### 53.1 Branch policy

Primary branch:

```text
main
```

Feature branches:

```text
feat/<feature-name>
fix/<issue-name>
```

### 53.2 Commit strategy

Create a commit after each gate:

```text
feat: establish deterministic simulation core
feat: implement information fusion
feat: add decision scoring and AAR
feat: add instructor controls
feat: add multiplayer relay
feat: add advanced analytics
chore: harden deployment and demo
```

### 53.3 Rollback points

Tag major milestones:

```text
v0.1-p0
v0.2-p1
v0.3-p2
v1.0-demo
```

### 53.4 Working tree rule

Do not continue large architectural changes with an unknown broken working tree.

### 53.5 Emergency rollback

If a feature breaks:

1. stop the feature
2. inspect last known good commit
3. revert/reapply minimally
4. restore gate green
5. continue from stable baseline

---

## 54. DEPENDENCY GOVERNANCE

### 54.1 Allowed categories

Current locked dependencies are in Section 11.

### 54.2 Add dependency only when

At least one is true:

- substantial implementation reduction
- required protocol support
- accessibility requirement
- testing requirement
- deployment requirement

### 54.3 Dependency review

Before adding:

record:

- package
- version
- purpose
- alternatives
- bundle impact
- maintenance status

### 54.4 No dependency for trivial functions

Do not install packages for:

- debounce
- UUID generation
- formatting
- array grouping
- basic math
- simple CSV serialization

unless there is a demonstrated reason.

---

## 55. ERROR RECOVERY AND STUCK PROTOCOL

### 55.1 Level 0 — Local debugging

- reproduce
- inspect stack
- inspect state
- patch smallest scope
- test

### 55.2 Level 1 — Implementation simplification

If the feature is too complex:

- simplify local abstraction
- preserve public interfaces

### 55.3 Level 2 — Replace internal implementation

Use a simpler implementation with the same contract.

### 55.4 Level 3 — Reduce feature scope

Move the feature down one priority tier.

### 55.5 Level 4 — Disable optional enhancement

Disable P3 feature.

### 55.6 Level 5 — Protect P0/P1

If necessary, remove all active P2/P3 work and return to:

> last green P0/P1 checkpoint.

### 55.7 Forbidden stuck behavior

Do NOT:

- rewrite the application
- switch frameworks
- replace the engine model
- remove tests
- hide errors
- claim completion without verification

### 55.8 Escalation record

When stuck longer than approximately 20 minutes on the same problem:

write to `docs/PROGRESS.md`:

```md
## Blocker
Problem:
Attempted:
Observed:
Current hypothesis:
Next experiment:
Fallback:
```

Then run the next smallest diagnostic experiment.

---

## 56. FEATURE PRIORITY, CUT RULES, AND TIME GOVERNANCE

### 56.1 The complete-build philosophy

Our timeline intentionally supports:

> a deeper-than-MVP prototype.

We therefore WANT:

- richer scenarios
- advanced replay
- counterfactuals
- strong AAR
- multiplayer
- analytics
- scenario mutation
- authoring
- polish

when they provide genuine value.

### 56.2 The two-hour buffer

Reserve approximately two hours of theoretical engineering capacity.

Never schedule them as committed feature work.

### 56.3 Ideal vs buffered plan

The theoretical engineering capacity represented by Blocks A–E is approximately **26.5–28 hours**, depending on the 3–7/8 PM and 10–2.5/3 AM windows. The intended commitment after reserving approximately two hours of contingency is approximately **24.5–26 hours**.


The agent MUST maintain:

### Ideal Plan
All intended work.

### Buffered Plan
Intended work minus approximately two hours of contingency.

The buffered plan is the real commitment.

### 56.4 Feature evaluation equation

Use conceptually:

```text
Feature Value =
(user value
+ requirement relevance
+ judge visibility
+ differentiation
+ technical depth
+ demo value
+ copy resistance)
/
(engineering effort
+ dependency risk
+ failure risk)
```

This is not a numeric probability.

Use it for prioritization.

### 56.5 Cut order

If schedule slips:

1. visual extras
2. presentation-only extras
3. additional scenarios
4. analytics depth
5. authoring
6. LLM narration
7. multiplayer enhancements

Never cut before considering:

- P0 core
- P1 intelligence
- flagship AAR
- demo reliability

### 56.6 Multiplayer cut position

Because multiplayer is an official expected outcome:

> it is the LAST P2 feature to be cut.

If it must be cut:

- leave architecture interfaces intact
- preserve LocalSessionClient
- document the limitation honestly
- do not claim multiplayer is implemented

### 56.7 High-value hard feature rule

A difficult feature SHOULD be implemented when:

- it visibly differentiates the product
- it deepens the core
- it is connected to PS requirements
- it is reproducible
- it does not threaten prior gates

### 56.8 No feature accumulation

Do not add features merely because:

> “we still have time.”

Every addition must have a reason.

---

## 57. ENGINEERING SCHEDULE — ACTUAL MULTI-DAY EXECUTION

### 57.1 Block A — 12 PM–8 PM

Primary objectives:

#### 12–1
- repository setup
- dependency installation
- agent instruction files
- shell
- routes

#### 1–2
- scenario schema
- scenario loader
- flagship JSON
- event engine

#### 2–3
- degradation
- report lifecycle
- belief engine

#### 3–4
- decision engine
- verification
- scoring foundation

#### 4–5
- Trainee Console
- core state display

#### 5–6
- AAR
- replay

#### 6–7
- P1 mechanisms
- demo path

#### 7–8
- golden tests
- integration
- first deployed build

### 57.2 Block B — approximately 10/11 PM–1/2 AM

Objectives:

- advanced P1 refinement
- instructor controls
- richer AAR
- visual polish
- deployment hardening

Do NOT begin risky architecture changes late at night.

### 57.3 Block C — 3 PM–7/8 PM after college

Objectives:

- P2 networking
- multiplayer
- relay
- instructor monitor
- reconnect

### 57.4 Block D — 10 PM–2:30/3 AM

Objectives:

- second scenario
- scenario mutation
- adaptive difficulty
- analytics
- end-to-end tests
- advanced AAR

### 57.5 Block E — Sunday

Budget approximately 7 engineering hours:

- complete remaining P2
- complete selected P3
- final visual polish
- performance
- deployment
- QA

Theoretical engineering availability is approximately 25.5–28 hours across Blocks A–E. The deliberate committed engineering budget is approximately 23.5–26 hours after reserving roughly 2 hours of buffer. This range reflects the user-defined sleep/fatigue variability in Blocks B and D.

Theoretical additional time remains contingency.

### 57.6 October 5

Do NOT plan normal feature development.

Primary tasks:

- PPT
- video
- screenshots
- final demo recording
- judge walkthrough
- submission packaging

Only fix defects that threaten submission.

---

## 58. ENGINEERING GATES

### 58.1 Gate 0 — Repository boots

Pass:

- dependencies installed
- dev server starts
- typecheck works
- tests framework works

### 58.2 Gate 1 — Engine

Pass:

- flagship loads
- event timeline advances
- reset deterministic
- validation passes

### 58.3 Gate 2 — P0

Pass:

- trainee can complete flagship locally
- decision is recorded
- consequence occurs
- AAR opens

### 58.4 Gate 3 — P1

Pass:

- fusion
- contradiction
- entropy
- regret
- EVPI/EVSI
- scoring
- counterfactual
- replay

all work on golden scenario.

### 58.5 Gate 4 — Demo

Pass:

- Demo Mode launches in one action
- WOW occurs
- decision
- AAR
- reset < 3 seconds

### 58.6 Gate 5 — P2

Pass:

- network session
- commander
- analyst
- relay
- instructor
- reconnect
- team AAR

### 58.7 Gate 6 — Advanced

Pass:

- selected P3 features stable
- no regression

Dependency rule: P3 features that depend on P2 networking MUST wait for Gate 5. P3 features that depend only on P1/P0 (for example Presentation Mode and Scenario Authoring) MAY begin after Gate 4/Demo and are still subject to their own tests. This prevents a networking failure from blocking independent high-value work.

### 58.8 Gate 7 — Deployment

Pass:

- production build
- Render health
- network demo
- local fallback
- export

### 58.9 Gate 8 — Submission

Pass:

- final screenshots
- PPT assets
- video
- deployed URL
- repository
- README
- environment file template
- no secrets

---

## 59. ACCEPTANCE CRITERIA — MASTER CHECKLIST

### 59.1 Product

- [ ] User understands the problem
- [ ] User can begin a scenario
- [ ] User receives information
- [ ] Information degrades
- [ ] Belief changes
- [ ] User decides
- [ ] Consequence occurs
- [ ] AAR explains result

### 59.2 Official requirement coverage

- [ ] Web-based
- [ ] Multi-domain
- [ ] Delay
- [ ] Dropout
- [ ] Contradiction
- [ ] Decision under degraded information
- [ ] Multiplayer
- [ ] Instructor controls
- [ ] Real-time trainee monitoring
- [ ] Exportable AAR
- [ ] Individual timeline
- [ ] Team timeline
- [ ] Rationale

### 59.3 Engine

- [ ] deterministic
- [ ] pure
- [ ] replayable
- [ ] seeded
- [ ] tested
- [ ] no Date.now in engine
- [ ] no Math.random in engine
- [ ] no hidden side effects

### 59.4 Data

- [ ] synthetic labelled
- [ ] no production claims
- [ ] schema validated
- [ ] hashes generated

### 59.5 Math

- [ ] belief bounded
- [ ] entropy bounded
- [ ] utilities finite
- [ ] regret bounded
- [ ] EVPI non-negative within tolerance
- [ ] EVSI finite
- [ ] Net VOI defined
- [ ] scores bounded
- [ ] calibration explicitly caveated

### 59.6 UI

- [ ] design tokens
- [ ] responsive
- [ ] focus states
- [ ] tooltips
- [ ] loading
- [ ] error
- [ ] empty
- [ ] reduced motion
- [ ] synthetic badge

### 59.7 Multiplayer

- [ ] room create
- [ ] room join
- [ ] role validation
- [ ] shared state
- [ ] relay
- [ ] reconnect
- [ ] role-specific redaction
- [ ] team AAR

### 59.8 AAR

- [ ] decision
- [ ] belief at decision
- [ ] outcome
- [ ] truth
- [ ] never saw
- [ ] contradictions
- [ ] verification
- [ ] counterfactuals
- [ ] coach notes
- [ ] provenance
- [ ] limitations

### 59.9 Deployment

- [ ] local build
- [ ] production build
- [ ] Render
- [ ] WebSocket
- [ ] health
- [ ] fallback
- [ ] no secrets

---

## 60. DEMO SCRIPT AND PRESENTER RUNBOOK

### 60.1 30-second verbal opening

Presenter says:

> “DHUNDH is a decision-training system for situations where the information environment itself is unreliable. Instead of judging a decision only by what eventually happened, DHUNDH evaluates what the trainee could reasonably know when they made the decision.”

### 60.2 0:00–0:30

Open Demo Mode.

Show:

- scenario
- clock
- four channels
- initial evidence

Do not explain every UI element.

### 60.3 0:30–1:00

Let information arrive.

Show:

- fresh report
- delayed report
- channel state

### 60.4 1:00–1:30

Trigger degradation.

Show:

- LAND degraded
- contradiction
- Fog Index spike
- belief movement

Presenter line:

> “The system is not hiding information randomly. It is changing what the trainee can reasonably know.”

### 60.5 1:30–2:00

Open verification panel.

Show:

- cost
- delay
- feasibility

Then either:

- verify
- or proceed

### 60.6 2:00–2:30

Commit decision.

Show:

- rationale
- selected reports
- decision lock

### 60.7 2:30–3:00

Open AAR.

Show first:

> “Decision quality at decision time.”

Then:

- outcome
- what you knew
- what you never saw
- counterfactual

### 60.8 Key sentence

Presenter says:

> “A good decision can still have a bad outcome. DHUNDH separates those two things.”

### 60.9 If judge asks for multiplayer

Open instructor/network mode and show:

- two roles
- relay
- live instructor monitor
- team AAR

### 60.10 If network fails

Switch to:

> local Demo Mode

Do not apologize.

Say:

> “The same engine runs locally, so the training scenario does not depend on connectivity.”

---

## 61. PPT ALIGNMENT

### 61.1 Slide 1 — Problem

Headline:

> **Decision quality breaks down when the information environment does.**

Visual:

- four information channels
- delayed/missing/contradictory examples

Proof:

- official PS requirement

### 61.2 Slide 2 — Gap

Headline:

> **Most scenario evaluation sees the outcome. DHUNDH records the information state.**

Visual:

two timelines:

```text
WHAT HAPPENED
vs
WHAT TRAINEE KNEW
```

### 61.3 Slide 3 — Solution

Headline:

> **A deterministic web training environment for degraded information.**

Diagram:

```text
Reports
→ Degradation
→ Belief
→ Decision
→ Consequence
→ AAR
```

### 61.4 Slide 4 — Innovation

Headline:

> **Decision-Time-Conditioned Evaluation**

Show:

- belief state
- regret
- Fog
- EVPI
- counterfactual

Do not overwhelm the slide with formulas.

### 61.5 Slide 5 — Technology

Show:

- deterministic event engine
- TypeScript
- React/Vite
- WebSocket
- scenario schema
- SVG visualization

Data note:

> “All scenarios are synthetic and fictional.”

### 61.6 Slide 6 — Impact / Future

Show:

- repeatable training
- instructor control
- team coordination
- scenario authoring
- analytics

Do NOT claim:

> validated training effectiveness.

Say:

> “Designed as a measurable prototype with a path to instructor-authored training scenarios.”

---

## 62. VIDEO PLAN

### 62.1 Recommended length

Target:

> 2–3 minutes.

### 62.2 Shot order

1. Product opening
2. Scenario
3. Incoming reports
4. Degradation
5. Contradiction
6. Belief shift
7. Decision
8. Consequence
9. AAR
10. Multiplayer
11. Closing architecture/impact

### 62.3 Screen recording

Record at:

- full desktop resolution
- stable cursor
- no browser bookmarks if possible

### 62.4 Voiceover

Keep claims factual.

Avoid:

> “This solves military decision-making.”

Prefer:

> “This prototype demonstrates a measurable way to evaluate decisions under degraded information.”

### 62.5 Recording resilience

Record:

- one uninterrupted flagship demo
- separate AAR clip
- separate multiplayer clip

If the long recording fails, assemble the short clips.

---

## 63. JUDGE QUESTIONS AND DEFENCE

### 63.1 “Why not just use an LLM?”

Answer:

> The core system requires deterministic, explainable evaluation. An LLM is not needed to calculate belief or score a decision. It is optional only for narrative AAR wording.

### 63.2 “What is the real innovation?”

Answer:

> The product evaluates decisions using the information state available at the decision timestamp and then separates decision quality from eventual outcome.

### 63.3 “Is this real military doctrine?”

Answer:

> No. The scenarios are synthetic and fictional. Reliabilities, payoffs and entities are authoring assumptions. The prototype demonstrates the training architecture and evaluation method, not doctrine.

### 63.4 “Where did your probabilities come from?”

Answer:

> They are explicit scenario-authoring parameters used for a transparent reference model. They are not empirical military measurements.

### 63.5 “Why not judge only the outcome?”

Answer:

> Because a negative outcome does not necessarily mean the decision was poor given the information available at the time. Our AAR keeps those concepts separate.

### 63.6 “How do you know the scoring model is correct?”

Answer:

> We do not claim it is universally correct. It is a transparent normative reference model for synthetic scenarios, with its assumptions shown to the user.

### 63.7 “Why use entropy?”

Answer:

> Entropy provides a compact measure of uncertainty for binary hypotheses. We use it as a visualization and diagnostic, not as a claim of operational truth.

### 63.8 “Why evidence groups?”

Answer:

> Multiple reports may come from the same underlying observation. Counting them independently could double-count evidence, so evidence groups provide a transparent anti-double-counting rule.

### 63.9 “How do you prevent the system from rewarding caution?”

Answer:

> Standing down has explicit utility and is not automatically optimal. The decision engine evaluates the expected utility of all actions under the current belief state.

### 63.10 “How do you prevent aggressive decisions from always winning?”

Answer:

> Aggressive actions can carry large negative utility in unfavorable states. The scoring evaluates expected value and regret rather than a fixed preference for action.

### 63.11 “Is EVPI actually useful to a trainee?”

Answer:

> We use it as an explanatory diagnostic: how much perfect information would have been worth at that moment. It is not itself the trainee's score.

### 63.12 “What is simulated?”

Answer:

> Scenario events, reports, reliabilities, utilities, entities and geography are synthetic. The event engine, fusion, scoring, replay and AAR are actual implemented computation.

### 63.13 “How do you validate the prototype?”

Answer:

> Deterministic golden scenarios, unit tests, integration tests, role-redaction tests, E2E demo tests and repeatable replay.

### 63.14 “What happens if the network fails?”

Answer:

> The core scenario runs locally without external APIs or network services.

### 63.15 “Why not use a database?”

Answer:

> The prototype's core value is the training workflow, not account management. In-memory server state plus browser history removes infrastructure without reducing the judge-visible functionality.

### 63.16 “Why web instead of VR?”

Answer:

> The PS explicitly permits a web-based tool. Web delivery allows a functioning multi-domain simulation and instructor workflow without specialized hardware.

### 63.17 “Can this scale?”

Answer:

> The scenario engine is data-driven, deterministic and separated from the UI. The next extensibility layer is instructor-authored scenario packs and richer session infrastructure.

### 63.18 “Can scenarios be randomized?”

Answer:

> Yes. The mutation system is seed-based so randomized variants remain reproducible.

### 63.19 “Can two users have different information?”

Answer:

> Yes. Role-specific view projection allows partitioned channel visibility and structured relay.

### 63.20 “How does the analyst help?”

Answer:

> The analyst sees a different subset of the information and can relay critical reports to the commander under a bounded relay budget.

### 63.21 “What exactly is the AAR?”

Answer:

> It reconstructs the session timeline, information available, belief state, decision, outcome, missed information, verification and counterfactuals.

### 63.22 “What prevents gaming the score?”

Answer:

> The score is deterministic, based on the recorded state and scenario model. Rationale and evidence inspection are recorded separately rather than granting arbitrary hidden points.

### 63.23 “Does the model learn?”

Answer:

> The core model does not train online. Adaptive difficulty changes information-flow parameters based on recorded performance rules.

### 63.24 “Does calibration prove the system improves people?”

Answer:

> No. Calibration is displayed as a diagnostic and explicitly caveated. The prototype does not claim learning-transfer validation.

### 63.25 “Why is the prototype valuable if the data is synthetic?”

Answer:

> The central contribution is the decision-evaluation workflow and simulation engine. Synthetic data makes the system reproducible without pretending to have real operational datasets.

---

## 64. FINAL PRE-SUBMISSION QUALITY ASSURANCE

### 64.1 Product QA

- [ ] Home
- [ ] Demo
- [ ] Scenario Library
- [ ] Briefing
- [ ] Trainee
- [ ] Instructor
- [ ] Multiplayer
- [ ] AAR
- [ ] Analytics
- [ ] Presentation mode

### 64.2 Engine QA

- [ ] determinism
- [ ] replay
- [ ] counterfactual
- [ ] mutation
- [ ] difficulty
- [ ] scoring
- [ ] VOI
- [ ] contradiction

### 64.3 Security QA

- [ ] no committed `.env`
- [ ] no exposed API key
- [ ] truth redacted
- [ ] token not shown
- [ ] role validated
- [ ] payloads validated
- [ ] AAR REST endpoint requires a valid session token

### 64.4 Deployment QA

- [ ] Render health
- [ ] WebSocket
- [ ] static fallback
- [ ] local mode
- [ ] production build

### 64.5 Presentation QA

- [ ] six slides
- [ ] no unreadable screenshots
- [ ] all claims defensible
- [ ] synthetic data labelled
- [ ] no fake metrics
- [ ] no fake AI claims

### 64.6 Video QA

- [ ] opening hook
- [ ] degradation
- [ ] decision
- [ ] AAR
- [ ] multiplayer if required
- [ ] no broken state
- [ ] final screen

---

## 65.0 v1.2 consistency patches applied before implementation

The following issues were explicitly patched in this revision: (1) Timeliness now uses seconds consistently; display conversion to minutes is presentation-only. (2) `/api/sessions/:code/aar` requires session-token authorization. (3) P0/P1 belief and verification boundaries are explicit. (4) Shadow styling is tokenized. (5) GitHub path-specific instruction files are included. (6) Calibration bin boundaries are unambiguous.

## 65. FINAL ENGINEERING AUDIT

### 65.1 Architecture audit

Confirm:

- engine is pure
- client/server reuse engine
- no database
- no authentication
- networked state is authoritative on server
- local mode is independent
- truth is redacted
- scenario data is validated

### 65.2 Requirement audit

Map every official requirement to:

- code
- UI
- test
- demo

### 65.3 Mathematical audit

Verify:

- formulas are consistent
- utility sign conventions are consistent
- time cost is applied consistently
- probability updates are bounded
- duplicate evidence does not double count
- counterfactuals do not mutate history
- calibration is caveated

### 65.4 Product audit

Ask:

> If the UI were removed, would the engine still be a meaningful system?

Yes.

Ask:

> If the math were removed, would it become a generic dashboard?

Yes.

Therefore:

> math and engine are genuine product depth, not decorative features.

### 65.5 Demo audit

Can the presenter reach the WOW moment in:

> <= 60 seconds?

Can they reach AAR in:

> <= 3 minutes?

Can they reset in:

> <= 3 seconds?

If no:

> fix before submission.

---

## 66. FINAL HANDOFF TO GITHUB COPILOT AGENT

### 66.1 First instruction

When Copilot starts, it MUST treat this file as the authoritative engineering specification.

### 66.2 Build sequence

Execute:

```text
1. Repository setup
2. Agent controls
3. Core engine
4. Scenario schema
5. Flagship scenario
6. P0 UI
7. P0 AAR
8. P1 intelligence
9. Golden tests
10. Demo mode
11. Instructor
12. P2 multiplayer
13. Second scenario
14. Mutation/difficulty
15. Analytics
16. Dependency-independent P3 features that already passed the Gate 4 dependency rule
17. Network-dependent P3 features after P2 is green
18. Deployment
19. Final QA
```

### 66.3 Before every tier

Run the relevant gate.

### 66.4 If gate fails

Do not move forward.

### 66.5 If time remains

Only add the next highest-value feature.

### 66.6 If time is lost

Follow Section 56.

### 66.7 If the application becomes broken

Return to the last green checkpoint.

### 66.8 Final rule

> **A smaller coherent system is preferable to a larger broken system.**

But:

> **Do not prematurely cut technically meaningful, high-value advanced features merely because they are difficult.**

The project has deliberately been given a buffered multi-day engineering window.

---

## 67. FINAL DEFINITION OF DONE

The project is DONE only when all of the following are true:

### Product

- flagship scenario playable
- decision mechanism understandable
- AAR complete
- synthetic-data disclosure visible

### Official PS alignment

- delay
- dropout
- conflict
- multiplayer
- instructor controls
- monitoring
- AAR

### Technical

- typecheck passes
- unit/integration tests pass
- golden tests pass
- production build passes
- critical E2E passes

### Deployment

- public URL works
- health endpoint works
- WebSocket works
- local fallback works

### Presentation

- six-slide PPT complete
- demo flow rehearsed
- screenshots captured
- video recorded

### Repository

- README complete
- AGENTS.md present
- `.github/copilot-instructions.md` present
- dependency log current
- progress log current
- no secrets

---

## 68. IMPLEMENTATION DECISION RECORD — FROZEN CHOICES

The following choices are considered frozen unless a compatibility blocker is documented.

### Product

```text
Name: DHUNDH
PS: 26248
```

### Core thesis

```text
Information-aware decision training.
```

### Core intelligence

```text
Reliability-weighted belief fusion
+
decision-time-conditioned scoring
+
AAR
```

### Core architecture

```text
React + Vite + TypeScript
+
pure TypeScript engine
+
Express + ws
+
localStorage
+
deterministic scenarios
```

### Deployment

```text
Render Web Service
+
Vercel local fallback
```

### Data

```text
100% synthetic scenario content
```

### AI

```text
No LLM dependency for core operation.
Optional P3 narrative only.
```

### Domain framing

```text
Fictional
Abstract
Training-oriented
Non-operational
```

---

## 69. IMPLEMENTATION NOTES ON CURRENT PLATFORM SUPPORT

### 69.1 GitHub Copilot repository instructions

The repository SHOULD contain:

```text
.github/copilot-instructions.md
```

and:

```text
AGENTS.md
```

GitHub currently documents repository-wide custom instructions, path-specific instructions, and agent instructions including `AGENTS.md`. These files are suitable for keeping permanent project constraints available to Copilot agents.

### 69.2 Current runtime/tooling baseline

As of 2 October 2026, Node.js 24.21.0 is an LTS release and Node.js 20 is EOL. React 19.3.0 is the current React release, and Vite 8.3.2 is the current Vite package version at the time this audit was performed. The project MUST therefore use Node 24 LTS rather than Node 20. Package-lock remains authoritative after the first install.

### 69.3 Render WebSocket support

Render currently documents inbound WebSocket support for web services and specifically provides an Express + `ws` example. Production clients must use `wss://` over the public internet.

### 69.4 Engineering implication

The architecture's:

> Vite frontend + Express/ws server + Render

combination is consistent with the current documented deployment model.

---

## 70. FINAL SOURCE TRACEABILITY

The engineering specification incorporates the following source categories:

### Official / primary

- uploaded SIH PS document
- current GitHub Copilot documentation for repository/agent instructions
- current Render documentation for WebSockets and web services
- current Node.js release/support documentation
- current React release/version documentation
- current Vite package/release documentation

### Research / academic

- decision/outcome bias literature
- AAR/debriefing literature
- calibration literature, including contested evidence

### Strategic inference

- competitive leverage
- AI consensus risk
- prototype compression
- replication resistance

The project MUST NOT present strategic inferences as official SIH criteria.

---

## 71. FINAL QUALITY PRINCIPLES

### Principle 1

> **Do the hard thinking before the hard coding.**

### Principle 2

> **Every important number should be explainable.**

### Principle 3

> **Every important feature should have a reason.**

### Principle 4

> **Every failure should have a fallback.**

### Principle 5

> **Every requirement should have evidence in the demo.**

### Principle 6

> **Synthetic is acceptable when it is honestly labelled.**

### Principle 7

> **AI may accelerate engineering; it does not replace product reasoning.**

### Principle 8

> **The system should feel deeper than it is large.**

### Principle 9

> **The best differentiator is behavior, not branding.**

### Principle 10

> **Never sacrifice the coherent core for optional complexity.**

---

## 72. FINAL ENGINEERING COMMAND

Copilot:

> READ THIS SPECIFICATION COMPLETELY.

Then:

> INSPECT THE REPOSITORY.

Then:

> CREATE THE AGENT CONTROL FILES.

Then:

> BUILD P0.

Then:

> VERIFY P0.

Then:

> BUILD P1.

Then:

> VERIFY P1.

Then:

> BUILD THE DEMO.

Then:

> VERIFY THE DEMO.

Then:

> BUILD P2.

Then:

> VERIFY P2.

Then:

> BUILD SELECTED P3 FEATURES.

Then:

> DEPLOY.

Then:

> TEST.

Then:

> PERFORM FINAL QA.

Do not skip gates.

Do not invent architecture.

Do not claim unsupported functionality.

Do not fabricate data.

Do not replace the product thesis.

Do not turn the project into a generic dashboard.

Build DHUNDH.

---

# END OF COPILOT MASTER ENGINEERING SPECIFICATION

**SPECIFICATION COMPLETE — READY FOR ENGINEERING AUDIT**

### External implementation notes

- GitHub repository-wide Copilot instructions: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions
- GitHub custom-instruction support: https://docs.github.com/en/copilot/reference/custom-instructions-support
- Render WebSockets: https://render.com/docs/websocket
- Render Web Services: https://render.com/docs/web-services
