# Ariadne Platform Architecture

```text
                Ariadne Desktop
                     │
              user commands/UI
                     │
                     ▼
               Ariadne Core
          canonical Thread engine
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   SQLite Storage          Resume Engine
         ▲
         │
    validated events
         │
 ┌───────┼────────┬───────────┐
 ▼       ▼        ▼           ▼
OS     VS Code   Browser    Future
Sensor Adapter   Adapter    Adapters
```

## Canonical state

- Core owns Thread lifecycle and state.
- Storage persists canonical state durably.
- Adapters and sensors submit bounded, validated facts.
- UI renders and controls; it does not fork lifecycle logic.

There is one globally active Thread at a time in the current product.

## Crate boundaries

### [crates/ariadne-core/](../crates/ariadne-core)

Owns:

- Thread lifecycle
- Resume Brief
- bounded rolling context
- context admission and capture policy
- artifacts, events, timeline, graph
- deterministic Resume Plan
- privacy-aware domain rules

Core is platform-independent.

### [crates/ariadne-storage/](../crates/ariadne-storage)

Owns:

- SQLite schema and migrations
- transactional writes
- revision checks
- generation handling
- tombstones and delete semantics

Canonical JSON persistence is not part of this architecture.

### [crates/ariadne-protocol/](../crates/ariadne-protocol)

Owns local adapter contract:

- protocol versioning
- adapter identity and authentication
- capability declaration
- message validation and bounded payloads
- compatibility behavior

### Platform crates

Platform-specific APIs remain outside Core.

Current production implementation:

- [crates/ariadne-platform-windows/](../crates/ariadne-platform-windows)

Future additions (not claimed as implemented): macOS, Linux, and other meaningful local companion sensors.

### [apps/desktop/](../apps/desktop)

Primary Ariadne application:

- Home/current context
- Thread lifecycle actions
- Resume Brief editing
- Thread library and resume actions
- privacy controls
- integration state
- diagnostics and logs
