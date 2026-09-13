# Ariadne Platform Agent Handoff

## Completed in this migration slice

- Added a Rust workspace with portable Core, SQLite storage, adapter protocol, and Windows sensor crates.
- Added bounded Thread lifecycle, rolling context, privacy admission, deterministic Resume planning, and graph/timeline limits.
- Added storage revisions and generations so stale writes and delayed post-delete writes are rejected.
- Added a Tauri desktop UI vertical slice with status, Start, Stop, Pause/Resume, list, and Resume controls.
- Preserved the working TypeScript VS Code extension as the legacy implementation and migration source.
- Added platform privacy, security, migration, architecture, and validation contracts.

## Not yet complete

- Rust/Windows compilation has not been verified in this Linux workspace because Rust tooling is unavailable here.
- The Tauri desktop shell is scaffolded but not yet packaged into `Ariadne.exe`.
- The Windows sensor is wired into the desktop event loop behind `cfg(windows)`, but the connection is not yet build-verified on Windows.
- The VS Code extension is not yet a protocol client; it still writes legacy JSON through its existing lifecycle service.
- Browser adapter, native IPC transport, migration importer, tray actions, start-at-login, crash-recovery exercise, and performance measurements remain.

## Required next sequence

1. Install/enable Rust and Tauri tooling in CI and a Windows development environment.
2. Fix any platform/compiler errors without weakening the Core invariants.
3. Implement a local Windows named-pipe transport and connect the Core event loop.
4. Port the existing VS Code capture to the versioned protocol and add migration parity tests.
5. Add the browser adapter with explicit attachment and URL policy tests.
6. Add tray/start-at-login and complete the Windows installer.
7. Exercise crash/deletion races and report actual measurements.
