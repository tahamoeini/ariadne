# Ariadne Platform Agent Handoff

## Current implementation status

- Added a Rust workspace with portable Core, SQLite storage, adapter protocol, and Windows sensor crates.
- Added bounded Thread lifecycle, rolling context, privacy admission, deterministic Resume planning, and graph/timeline limits.
- Added storage revisions and generations so stale writes and delayed post-delete writes are rejected.
- Added a Tauri desktop MVP surface with status, Start, Save Recent Context, Checkpoint, Stop/Resume, pause/privacy controls, list, bounded Resume actions, tray, logs, close-to-hide, and reversible Windows Start at Login.
- Connected the TypeScript VS Code extension to authenticated local Core IPC while retaining its JSON lifecycle as explicit migration compatibility.
- Added startup import of retained `legacy/*.json` files through the existing importer.
- Added locked CI dependency resolution and Windows installer artifact upload.
- Added platform privacy, security, migration, architecture, and validation contracts.

## Not yet complete / not verified

- Browser adapter/native browser integration is deferred.
- Windows runtime/manual validation, crash/restart exercise, full deterministic race/privacy suite, and performance measurements are not yet verified.
- Legacy VS Code JSON ownership remains compatibility code until migration parity and external validation are complete.

## Required next sequence

1. Complete Windows runtime/manual validation and inspect the hosted installer.
2. Add deterministic crash/restart and race/privacy integration coverage.
3. Add the browser adapter only when supported browser-native integration is selected.
4. Measure Windows CPU, memory, startup, event latency, database growth, and Resume latency.

## Current-state table

| Implemented | Verified | Remaining | Deferred | Known failures |
|---|---|---|---|---|
| Rust Core/SQLite, protocol IPC, Windows sensor boundary, VS Code bridge, desktop lifecycle/privacy, tray, logs, Start at Login, bounded Resume, legacy startup import | Local Rust subsystem gates; TypeScript compile/lint/typecheck/82 unit tests; desktop frontend build; hosted status tracked in PR #12 | Windows runtime/manual validation, crash/restart and complete race/privacy suite, browser adapter, performance, external product validation | macOS/Linux sensors, Android, cloud/accounts/sync, AI/LLM, telemetry, screenshots, clipboard/keystrokes/content capture | Local full Tauri Rust build is blocked by missing Linux GTK/WebKit/pkg-config; Unix socket runtime test is unavailable in this sandbox; Windows runtime not externally validated |
