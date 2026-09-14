# Ariadne VS Code Adapter

This directory defines the migration boundary for the existing VS Code extension. The implementation under `src/` remains usable migration compatibility, while `src/adapter/localProtocol.ts` forwards normalized observations to the authenticated local Ariadne Core endpoint when Desktop is installed.

## Intended facts

- workspace and repository identity
- active file/folder transitions
- edit occurrence without edit content
- cursor location when meaningful
- read-only Git enrichment where available

## Adapter responsibilities

The adapter observes supported VS Code events, normalizes them to the versioned local protocol, reconnects when the desktop Core restarts, and reports its capabilities. It does not own Thread lifecycle, storage, privacy policy, graph limits, or Resume ordering.

## Compatibility boundary

The extension does not become the platform's canonical Thread owner. Its legacy JSON lifecycle is retained temporarily for migration and backward compatibility. Remove that path only after migration parity, restart recovery, deletion behavior, and extension-host validation are complete.
