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

Open `http://localhost:5173` for the engineering foundation shell. Express/ws
listens on port 8787; `http://localhost:8787/health` and the proxied
`http://localhost:5173/health` expose health status. The `/ws` endpoint is
bootstrap-only: session messaging is not implemented.

`npm start` runs the server separately. With `NODE_ENV=production` it also serves
the built `dist` application. Set `PORT` in the process environment to override
the server port; the development proxy targets the default 8787. `.env.example`
documents configuration without creating a real `.env` or secrets.

`VITE_FORCE_LOCAL=1` is reserved for the static/local-only build; Gate 0 contains
no networked product UI to hide. Render and Vercel files are configuration only,
not deployment acceptance.

## Gate 1 foundation

The UI remains the Gate 0 boot shell. Gate 1 adds the exact synthetic flagship
scenario and a pure TypeScript engine; no playable product UI, belief/scoring,
AAR, or multiplayer is included.

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
Live instructor injects, RELAY, and ADVISE remain explicitly deferred rather
than silently succeeding.

Focused foundation checks: `npm test -- tests/engine tests/golden`.
Playwright remains configured for future E2E work. Actual gate evidence and
limitations are recorded in `docs/PROGRESS.md`.
