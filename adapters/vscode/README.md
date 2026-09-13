# Ariadne VS Code Adapter

This directory defines the migration boundary for the existing VS Code extension. The current implementation under `src/` remains the working sensor and legacy JSON-backed domain prototype until this adapter is connected to the local protocol.

## Intended facts

- workspace and repository identity
- active file/folder transitions
- edit occurrence without edit content
- cursor location when meaningful
- read-only Git enrichment where available

## Adapter responsibilities

The adapter observes supported VS Code events, normalizes them to the versioned local protocol, reconnects when the desktop Core restarts, and reports its capabilities. It does not own Thread lifecycle, storage, privacy policy, graph limits, or Resume ordering.

## Deferred until protocol wiring

Do not remove the existing extension storage or commands until import parity, restart recovery, deletion behavior, and extension-host validation prove that the Core path is equivalent or better.
