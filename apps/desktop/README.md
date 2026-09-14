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

The shell provides status, Thread creation, recent-context save, checkpoint editing, stop/resume, pause/resume capture, persisted privacy settings, startup hydration, authenticated local adapter IPC, adapter health, tray behavior, close-to-hide, bounded Resume actions, local logs, and a Windows foreground-metadata sensor behind a Windows-only compilation boundary. Windows runtime validation remains an external validation step; browser-native integration is deferred.
