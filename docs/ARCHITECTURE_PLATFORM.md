# Ariadne Platform Architecture

## Current migration state

The existing TypeScript VS Code extension remains an operational legacy implementation and migration source. The new Rust workspace is the target architecture. Until the VS Code adapter is switched to the local protocol, the two implementations must not be presented as a finished integrated product.

```text
OS sensor / VS Code / browser
             |
      bounded local messages
             v
      Rust Ariadne Core
             |
       SQLite storage
             |
      Tauri desktop UI
```

## Boundaries

- `crates/ariadne-core`: Thread lifecycle, bounded events, graph, timeline, privacy admission, and Resume planning. No OS or database dependencies.
- `crates/ariadne-storage`: SQLite schema, migrations, revisions, generation checks, and deletion tombstones.
- `crates/ariadne-protocol`: Versioned adapter messages, capability declarations, validation, and payload limits.
- `crates/ariadne-platform-windows`: Windows foreground metadata sensor. Other platform crates are intentionally not claimed as implemented yet.
- `apps/desktop`: Tauri shell and TypeScript UI. It is the first desktop vertical slice; sensor and adapter wiring remains a subsequent integration milestone.
- `src/`: Existing VS Code extension. Preserve it until migration parity is demonstrated.

## Canonical state rule

There is one global active Thread in the Core. `Start Thread` starts from now. `Save Recent Context` consumes only the bounded rolling context. Adapters observe and submit facts; they do not decide lifecycle, persistence, graph ownership, privacy policy, or resume ordering.

## Concurrency rule

The intended runtime is bounded producer queues feeding a single canonical Core state engine, followed by transactional persistence. Critical lifecycle commands must not be dropped. No correctness test may depend on arbitrary sleeps.

## Capability honesty

“Context missing” and “adapter cannot provide it” are different states. A Thread can show that browser context is unavailable because no browser adapter is connected; it must not silently imply that no browser activity occurred.
