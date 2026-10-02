# DHUNDH

Decision Training Under Degraded Information — SIH 2026 PS 26248.

The repository is governed by `COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md` and the repository Copilot/agent instructions under `.github/`.

## Gate 0 setup

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

Gate 0 has no scenario JSON or engine implementation. Scenario validation checks
JSON syntax only and explicitly permits zero files until Gate 1. Playwright is
configured for future `tests/e2e` tests; no E2E or golden tests exist at this gate.
Actual gate evidence and limitations are recorded in `docs/PROGRESS.md`.
