# Ariadne

Ariadne is a standalone, local-first context continuity platform for interrupted digital work.

Its purpose is to preserve enough factual context about a bounded unit of work (a **Thread**) so a person can return later and continue without rebuilding the entire mental model.

## Product definition

- Ariadne is a product, not a VS Code extension.
- Ariadne Desktop ([apps/desktop/](./apps/desktop)) is the primary application.
- Rust Core ([crates/ariadne-core/](./crates/ariadne-core)) is the canonical Thread engine.
- SQLite storage ([crates/ariadne-storage/](./crates/ariadne-storage)) is the durable source of local state.
- Adapters/sensors (for example browser and future editor integrations) are context sources that feed Core; they do not own lifecycle.

The historical root VS Code implementation has been removed from this repository root as part of the product cutover.

## Repository layout

- [apps/desktop/](./apps/desktop): Tauri desktop application (primary Ariadne app)
- [crates/ariadne-core/](./crates/ariadne-core): canonical Thread lifecycle, bounded context, Resume Brief, Resume Plan
- [crates/ariadne-storage/](./crates/ariadne-storage): SQLite schema/migrations/revisions/tombstones
- [crates/ariadne-protocol/](./crates/ariadne-protocol): local authenticated adapter protocol
- [crates/ariadne-platform-windows/](./crates/ariadne-platform-windows): Windows foreground sensor boundary
- [adapters/browser/](./adapters/browser): browser adapter boundary
- [adapters/vscode/](./adapters/vscode): reserved adapter boundary for future VS Code integration
- [docs/](./docs): product and architecture documents

## Core behaviors

- One globally active Thread at a time (initial product constraint)
- Human-authored structured Resume Brief:
  - Context / Findings
  - Decisions
  - Key Artifacts
  - Open Questions
  - Next Step
- Bounded factual timeline and context graph
- Local-only persistence and controls (pause, exclusions, deletion, delete all)

## Development

### Rust workspace

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
```

### Desktop app

```bash
npm --prefix apps/desktop ci
npm --prefix apps/desktop run build
```

### Browser adapter boundary

```bash
npm --prefix adapters/browser ci
npm --prefix adapters/browser run build
npm --prefix adapters/browser run lint
npm --prefix adapters/browser run typecheck
npm --prefix adapters/browser run test:unit
```

## Documentation

- [Product specification](docs/PRODUCT.md)
- [Platform architecture](docs/ARCHITECTURE_PLATFORM.md)
- [Platform decisions](docs/DECISIONS_PLATFORM.md)
- [Privacy model](docs/PRIVACY.md)
- [Validation strategy](docs/VALIDATION_PLATFORM.md)
