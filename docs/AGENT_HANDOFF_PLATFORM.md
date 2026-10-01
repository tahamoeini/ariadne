# Ariadne Platform Agent Handoff

## Current implementation status

- Added a Rust workspace with portable Core, SQLite storage, adapter protocol, and Windows sensor crates.
- Added bounded Thread lifecycle, rolling context, privacy admission, deterministic Resume planning, and graph/timeline limits.
- Added storage revisions and generations so stale writes and delayed post-delete writes are rejected.
- Added a Tauri desktop MVP surface with status, Start, Save Recent Context, structured Resume Brief, Stop/Resume, pause/privacy controls, list, bounded Resume actions, tray, logs, close-to-hide, and reversible Windows Start at Login.
- Connected the TypeScript VS Code extension to authenticated local Core IPC while retaining its JSON lifecycle as explicit migration compatibility.
- Added startup import of retained `legacy/*.json` files through the existing importer.
- Added locked CI dependency resolution and Windows installer artifact upload.
- Added platform privacy, security, migration, architecture, and validation contracts.

## Not yet complete / not verified

- Structured Resume Brief passes Rust workspace formatting, Core/storage/protocol/Windows-boundary tests (including SQLite round-trip coverage), VS Code compile/typecheck/lint and 99 unit plus extension-host tests, and the desktop frontend production build. The extension-host run on VS Code 1.136.0 covers saving a five-section brief, stopping, reopening the snapshot, and retaining Key artifacts when editing.
- The Tauri Rust application itself and end-to-end Resume Brief save/restart/resume flow have not been validated in a running desktop app. A Linux build lacks GTK/WebKit development packages; the native Windows build cannot start because this host has neither MSVC `link.exe` nor an installed compatible linker.
- Browser adapter/native browser integration is deferred.
- Windows runtime/manual validation, crash/restart exercise, full deterministic race/privacy suite, and performance measurements are not yet verified.
- The VS Code IPC adapter currently sends observed events and explicit references; it does not send live Resume Brief updates to Core. Legacy JSON remains compatibility/migration storage until that lifecycle has parity and external validation.

## Required next sequence

1. Complete Windows runtime/manual validation and inspect the hosted installer.
2. Add deterministic crash/restart and race/privacy integration coverage.
3. Add the browser adapter only when supported browser-native integration is selected.
4. Measure Windows CPU, memory, startup, event latency, database growth, and Resume latency.

## Current-state table

| Implemented | Verified | Remaining | Deferred | Known failures |
|---|---|---|---|---|
| Rust Core/SQLite, protocol IPC, Windows sensor boundary, VS Code event/reference bridge, desktop lifecycle/privacy, tray, logs, Start at Login, structured Resume Brief, bounded Resume, legacy startup import | Rust workspace formatting and Core/storage/protocol/Windows-boundary gates; VS Code compile/typecheck/lint; 99 unit and extension-host tests on VS Code 1.136.0; desktop frontend build | Tauri Rust app and end-to-end Resume Brief save/restart/resume; Windows runtime/manual validation, crash/restart and complete race/privacy suite, live Resume Brief bridge from VS Code, browser adapter, performance, external product validation | macOS/Linux sensors, Android, cloud/accounts/sync, AI/LLM, telemetry, screenshots, clipboard/keystrokes/content capture | Local Tauri compilation blocked by unavailable Linux GTK/WebKit development packages and missing Windows MSVC/compatible linker; Unix socket runtime test unavailable in this sandbox; Windows app runtime not externally validated |
