# Gate 0 dependency log

Created: 2026-10-02. Package manager: npm 11.19.0. Runtime: Node 24.21.0.

The frozen baseline was verified against the registry before installation.
Remaining direct packages use the registry's latest stable release at creation,
saved as exact versions. `package-lock.json` (format 3) captures the full resolved
dependency set. No upgrade pass or dependency-version deviation was made.

## Runtime dependencies

| Package                    | Resolved version | Purpose                                                     |
| -------------------------- | ---------------- | ----------------------------------------------------------- |
| react                      | 19.3.0           | Frozen UI runtime                                           |
| react-dom                  | 19.3.0           | Frozen browser renderer                                     |
| react-router-dom           | 7.18.4           | Locked browser-router architecture                          |
| zustand                    | 5.0.15           | Frozen future view-store dependency; unused in Gate 0       |
| zod                        | 4.6.5            | Frozen validation dependency; server configuration boundary |
| lucide-react               | 1.49.0           | Approved future icon dependency; unused in Gate 0           |
| @fontsource/ibm-plex-sans  | 5.3.0            | Bundled Sans 400/500/600                                    |
| @fontsource/ibm-plex-serif | 5.3.0            | Bundled Serif 400/600                                       |
| express                    | 5.2.1            | HTTP health and production static serving                   |
| ws                         | 8.22.0           | WebSocket bootstrap, no session protocol                    |
| tsx                        | 4.23.15          | Server and validation-script runtime                        |

## Development dependencies

| Package                     | Resolved version | Purpose                                                  |
| --------------------------- | ---------------- | -------------------------------------------------------- |
| vite                        | 8.3.2            | Frozen dev server and production bundler                 |
| @vitejs/plugin-react        | 6.1.1            | Approved React integration                               |
| typescript                  | 7.0.2            | Strict typecheck and build gate                          |
| concurrently                | 10.0.5           | Vite/server development orchestration                    |
| vitest                      | 5.0.3            | Single Gate 0 smoke test                                 |
| jsdom                       | 30.1.1           | Browser-like unit-test environment                       |
| @testing-library/react      | 16.3.3           | Root-route render smoke test                             |
| @testing-library/jest-dom   | 7.0.1            | Required test dependency; optional adapter not enabled   |
| @testing-library/user-event | 14.6.7           | Required future UI-interaction testing                   |
| @types/react                | 19.3.0           | React TypeScript scaffold declarations                   |
| @types/react-dom            | 19.3.0           | React DOM TypeScript scaffold declarations               |
| @types/express              | 5.0.6            | Server type declarations                                 |
| @types/ws                   | 8.18.2           | WebSocket type declarations                              |
| @types/node                 | 26.6.4           | Latest stable declarations; runtime remains Node 24.21.0 |
| prettier                    | 3.9.9            | Default formatting for implementation files              |
| @playwright/test            | 1.63.0           | Future E2E configuration only                            |

React/React DOM declarations are the normal TypeScript scaffold companions, not
runtime-library substitutions. Omitting them would remove the required JSX and
renderer types. They add no browser bundle weight. The other listed packages are
required by master Section 11 or the Gate 0 task; no utility, chart, animation,
LLM, database, authentication, or external-API dependency was added.

Only React, React DOM, routing, and bundled font/CSS assets are used by the boot
shell. Server/runtime tools stay outside the client bundle. The first production
build reported 313.49 kB JavaScript (99.23 kB gzip) and 4.74 kB CSS (1.54 kB gzip).
These are Gate 0 build outputs, not full-product performance acceptance.

## Installation evidence

- `npm install --no-fund`: exit 0; 221 packages added, 222 audited; npm reported
  zero vulnerabilities.
- `npm ls --depth=0`: exit 0; all 27 direct dependency versions match the manifest
  and lockfile.
- Node and both single-line runtime pins are exactly 24.21.0. Windows CRLF and LF
  are treated as line terminators, not part of the version.
- npm reported an unapproved install script for transitive `esbuild@0.28.2`.
  No approval or extra installation was needed for the successful commands.

## Optional matcher adapter compatibility note

The initial smoke test imported `@testing-library/jest-dom/vitest`. Typecheck
reproduced TS2428: that adapter declares `Assertion<T = any>`, while Vitest 5
declares a two-parameter `Assertion<R, T>`. Reproduction was `npm run typecheck`
with the adapter imported.

Gate 0 does not require that optional matcher adapter. The smoke test now uses
Testing Library queries with Vitest's native `toBe` assertions. Strict typecheck,
including dependency declarations, passes without `skipLibCheck`, casts,
suppression, package patches, or version replacements.

No dependency deviation was applied. Future use of the incompatible adapter
requires an explicit compatibility decision under master Section 47.6; do not
silently enable it or upgrade packages.
