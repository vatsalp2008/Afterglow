# 0001: Monorepo with a pure core

- Status: accepted
- Date: 2026-09-27

## Context

Afterglow has three deployables (the web studio, an edge API, and a realtime rooms server), shared logic between them, and a Python training pipeline. The prototype put everything in one Vite app. That worked, but nothing stopped rendering code from reaching into gesture logic, or core logic from reading the clock. That matters, because the project's credibility rests on deterministic, replayable tests of the input pipeline.

## Decision

- **pnpm workspaces and Turborepo.** Packages are split by responsibility: `core`, `tracking`, `render`, `collab`, and `ui`, plus apps `web`, `api`, and `realtime`. Shared dependency versions live in one pnpm catalog, pinned exactly.
- **`packages/core` is pure, and that's enforced, not just documented.**
  - Its tsconfig includes no DOM types.
  - ESLint bans `window`, `document`, `navigator`, `performance`, `requestAnimationFrame`, `Date.now`, `new Date`, and `Math.random` there.
  - Time and ids are passed in.
- **Internal packages are just-in-time.** Each exports `src/index.ts`, and the consumer compiles it (Vite in the app, Vitest in tests). There's no per-package build step.
- **Turborepo "transit" tasks.** Because JIT packages have no build output, Turborepo doesn't otherwise include their sources in a dependent's task hash. An edit to `core` would then replay a stale cached build of `web`. `build`, `typecheck`, and `test` depend on a no-op `transit` task that depends on `^transit`, which puts dependency sources into the hash while the tasks still run in parallel. This was verified by comparing task hashes before and after editing a core file.
- **`ml/` is a separate uv project** outside the JavaScript workspace, with its own lint, type, and test tooling.

## Alternatives considered

- **Keep one app with folders.** This is simpler, but boundaries stay a convention. The pure-core rule is the main thing we want enforced.
- **Compiled packages** (a `tsc` build per package). These are needed only when packages are published or consumed by a runtime that can't compile TypeScript. They add a build step and watch-mode complexity for no current benefit.
- **Nx.** More capable, but heavier than this repo needs. Turborepo's task graph and caching cover the requirements.
- **npm or Yarn workspaces.** pnpm's strict, non-flat `node_modules` catches undeclared dependencies, which keeps package boundaries honest.

## Consequences

- Every consumer must compile TypeScript. Vite and Vitest do. `apps/realtime` runs on Node's built-in type stripping, which only supports erasable syntax, and several core classes use constructor parameter properties, which aren't erasable. When `realtime` starts importing `core` in Phase 6, either those classes move to erasable syntax or `realtime` gets a build step.
- New tasks that read package sources must depend on `transit`, or they risk stale cache hits.
- Dependency versions change in one place (the catalog), which keeps packages consistent.
