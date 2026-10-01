# Ariadne Product Specification

## Purpose

Ariadne preserves factual context for interrupted work so a person can leave and later resume with low re-orientation cost.

## Canonical model

The canonical unit is a **Thread**.

Each Thread contains bounded, local context:

- identity and name
- lifecycle state and timestamps
- observed applications and workspaces/repositories when available
- artifacts and references
- factual timeline
- bounded context graph
- adapter/sensor capability state
- optional factual enrichments (for example Git metadata)
- human-authored Resume Brief
- deterministic Resume Plan

## Resume Brief

Resume Brief is first-class and human-authored. It is part of the canonical Thread state, not owned by adapters.

Structure:

1. Context / Findings
2. Decisions
3. Key Artifacts
4. Open Questions
5. Next Step

Users can create, update, clear, and inspect it directly in Ariadne.

## Product surfaces

Desktop must provide coherent local workflows for:

- Home / current context
- Active Thread
- Resume experience
- Thread library (browse/filter/inspect/resume/rename/edit/delete)
- Privacy and capture controls
- Integrations capability state
- Diagnostics

## Non-goals

- cloud accounts or sync
- telemetry
- semantic/embedding search
- productivity scoring
- pixel-perfect desktop/session restoration
- keystroke, clipboard, screenshot, or page-content capture

