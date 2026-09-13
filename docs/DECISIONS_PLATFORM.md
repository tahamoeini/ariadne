# Platform Migration Decisions

These decisions supplement the historical ADRs; they do not rewrite them.

## ADR-P001 — Rust Core, gradual migration

The existing TypeScript extension is retained as the first sensor and domain prototype. Portable lifecycle and state logic move gradually into Rust. The migration is staged so a new desktop shell does not erase working behavior or privacy tests.

## ADR-P002 — SQLite for canonical desktop storage

The desktop Core uses SQLite because transactions, indexes, migrations, and crash recovery matter for an always-running local application. The current JSON files remain importable legacy data until migration verification is complete.

## ADR-P003 — One active Thread globally

Multiple simultaneous Threads create ambiguous association when several sensors report events. The first platform release supports one active Thread globally and records a future need rather than guessing.

## ADR-P004 — Tauri desktop shell

Tauri is selected for a lightweight Rust-backed desktop application with a TypeScript UI and a clean path to Windows packaging. Native platform capture remains outside the UI shell.

## ADR-P005 — No premature sync

Stable IDs, schema versions, and generation markers leave room for future local peer synchronization. No cloud backend, account system, or distributed conflict model is implemented in this migration slice.
