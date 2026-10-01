# Ariadne Desktop

This is the standalone Windows-first Tauri application for Ariadne.

## Development

```bash
npm install
npm run build
cargo tauri dev
```

The desktop application stores canonical state in a local SQLite database under the platform app-data directory. It does not require an account, cloud service, or AI service.

## Current scope

The application provides status, Thread creation, recent-context save, Resume Brief editing, stop/resume, pause/resume capture, persisted privacy settings, startup hydration, authenticated local adapter IPC, adapter health, tray behavior, close-to-hide, bounded Resume actions, local logs, and a Windows foreground-metadata sensor behind a Windows-only compilation boundary. Windows runtime validation remains an external validation step; browser-native integration is deferred.
