# Ariadne Security Baseline

## Trust boundary

The Rust Core is the only canonical state owner. Sensors and adapters submit validated facts. UI actions become Core commands. No adapter may maintain a competing Thread database.

## Local IPC

The adapter protocol is versioned, local-machine-only, identity-bearing, capability-declared, size-limited, and validated before admission. Transport implementations must use an OS-local mechanism such as a Windows named pipe or Unix domain socket; Ariadne must not expose an LAN HTTP endpoint.

No protocol message may execute an arbitrary command. Resume actions are typed, bounded actions created by the Core.

## Persistence

SQLite is used for transactions and crash recovery. Writes carry a generation and optimistic revision. A stale writer is rejected. Thread deletion creates a tombstone; Delete All advances the storage generation. The application must report persistence failure instead of showing a false “saved” state.

Operational logs are bounded and must not include source contents, page contents, raw sensitive URLs, secrets, or keystrokes.

## Platform adapters

Platform-specific APIs belong in platform crates. `ariadne-core` must compile without Windows, macOS, Linux, or Android APIs. Each platform reports unsupported capabilities honestly rather than pretending parity.
