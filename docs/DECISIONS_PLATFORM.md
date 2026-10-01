# Platform Decisions

## ADR-P001 — Ariadne Desktop is the primary product surface

Ariadne ships as a standalone desktop application. Editor and browser integrations are adapters, not product owners.

## ADR-P002 — Canonical Thread ownership lives in Core

Only Core owns lifecycle, Resume Brief, context graph, timeline, and Resume Plan semantics.

## ADR-P003 — SQLite is mandatory canonical persistence

Durability, transactional integrity, revisions, and delete tombstones are required for reliable local continuity.

## ADR-P004 — One globally active Thread for v1

The first product version enforces one active Thread to avoid ambiguous cross-sensor association.

## ADR-P005 — Adapter protocol is authenticated and local-only

Adapters communicate with Core through an authenticated local protocol with bounded payloads and explicit capability states.

## ADR-P006 — Privacy defaults are strict

No cloud, no telemetry, no inferred intent, and no sensitive capture classes (keystrokes, clipboard, screenshots, page content).

