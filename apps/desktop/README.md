# Ariadne Desktop

This is the Windows-first Tauri shell for the Rust Core. It is intentionally a separate application from the retained VS Code extension.

## Development

```bash
npm install
npm run build
cargo tauri dev
```

The desktop application stores canonical state in a local SQLite database under the platform app-data directory. It does not require an account, cloud service, or AI service.

## Current scope

The shell currently demonstrates status, Thread creation, stop/resume, pause/resume capture, local persistence, startup hydration, and a Windows foreground-metadata sensor behind a Windows-only compilation boundary. Tray behavior, full settings/privacy surfaces, adapter IPC, and installable artifact validation remain hardening work.
