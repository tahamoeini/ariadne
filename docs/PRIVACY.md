# Ariadne Privacy Contract

This document is a product contract, not a promise inferred from implementation.
The platform must remain local-only and useful without AI, accounts, telemetry, or a network service.

## Captured facts

The Windows sensor is limited to foreground application identity, safe window metadata where supported, active/idle transitions, and timestamps. The first implementation does not scrape controls or read arbitrary application content.

The VS Code adapter may contribute workspace, repository, active file, file transitions, edit occurrence, cursor location, and deliberately available Git metadata. It never captures source contents, keystrokes, clipboard, terminal contents, or screenshots.

The browser adapter may contribute an active normal tab, title, sanitized HTTP(S) URL, navigation, and an explicit reference attachment. It never captures page content, DOM, forms, cookies, authentication data, browser history, or private/incognito activity by default.

## Privacy controls

- Pause Capture prevents new events from entering the rolling buffer or an active Thread.
- Application exclusions are checked before event admission.
- Browser domain exclusions are checked before browser event admission.
- Private/incognito events are rejected unless the user explicitly enables them.
- The UI must expose Running, Paused, Thread active, and Persistence degraded states.
- Delete Thread uses a durable tombstone so delayed writes cannot recreate the Thread.
- Delete All advances the local storage generation so writes from the previous generation are rejected.

## URL policy

The default browser policy keeps scheme, host, and path and strips query strings and fragments. Query strings and fragments can contain search terms, tokens, identifiers, or application state. Ariadne must not claim to preserve a full URL when sanitization has removed those components.

## Explicit non-goals

Ariadne must not add productivity scoring, employee monitoring, screenshots, keystrokes, clipboard or microphone capture, arbitrary page-content capture, automatic browser-history import, AI summaries, embeddings, semantic search, inferred importance, or exact desktop/session reconstruction.
