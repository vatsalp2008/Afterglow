# 0002: Pin TypeScript 6 until typescript-eslint supports 7

- Status: accepted
- Date: 2026-09-27

## Context

The project requires strict, type-aware linting with typescript-eslint, whose most valuable rules (for example `no-floating-promises` and `no-unnecessary-condition`) need the TypeScript compiler API.

The latest TypeScript is 7.0.2, the native (Go) compiler. Its npm package ships a native `tsc` binary and exposes only `unstable/*` APIs, not the classic compiler API. The latest typescript-eslint (8.70.1, and its current canary) declares a peer dependency of `typescript >=4.8.4 <6.1.0`.

The prototype used TypeScript 7 for typechecking and had no linter, so the conflict only surfaced when setting up the monorepo.

## Decision

Pin `typescript` to 6.0.3 for every package, through the pnpm catalog. Typechecking and linting use the same compiler.

## Alternatives considered

- **TypeScript 7 for `tsc`, TypeScript 6 for linting.** Two compilers can disagree on diagnostics, and forcing typescript-eslint to resolve a different `typescript` than the rest of the workspace means fighting peer-dependency resolution.
- **Drop type-aware lint rules.** This loses the rules that catch real bugs in async and nullable code, which is the reason for strict linting.
- **Skip typescript-eslint.** This would violate the project's quality bar.

## Consequences

- Typechecking uses the JavaScript compiler, which is slower than the native one. The whole workspace currently typechecks in about 2 seconds, so the cost is negligible at this size.
- TypeScript 6.0 is the last JavaScript-based release and was published as the transition to 7.0. Code that compiles cleanly on 6.0, without deprecated options, is expected to move to 7.0 mechanically.
- Revisit when typescript-eslint supports TypeScript 7: bump the catalog entry, run the full check suite, and supersede this ADR.
