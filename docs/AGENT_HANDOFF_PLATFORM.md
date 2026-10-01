# Ariadne Platform Handoff

## Current baseline

- Ariadne is a standalone desktop product.
- Canonical Thread state is owned by Rust Core and persisted in SQLite.
- The legacy root VS Code product implementation has been removed from `src/`.
- Browser adapter boundary remains under [adapters/browser/](../adapters/browser).
- VS Code integration is a future adapter surface under [adapters/vscode/](../adapters/vscode), not the product foundation.

## Core invariants

- one globally active Thread
- human-authored structured Resume Brief
- bounded events/timeline/graph
- local-only authenticated adapter protocol
- explicit capability/degradation states

## Verification expectations

- Rust workspace: fmt, clippy, tests, build
- Desktop frontend: production build
- Browser adapter boundary: build, lint, typecheck, unit tests

## Known scope

- Implemented: desktop lifecycle, local persistence, privacy controls, diagnostics/logging, Windows sensor boundary, local protocol stack
- Not implemented: shipped VS Code adapter, shipped browser-native host registration, non-Windows platform sensors
