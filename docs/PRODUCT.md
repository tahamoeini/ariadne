# Ariadne — Product Specification (0.0.1)

## Positioning

Ariadne helps developers pick up an interrupted code investigation where they left it.

VS Code remembers workspace state.
Git remembers source changes.
Ariadne remembers investigation context.

## Problem

When developers return after interruption, they often still have code and Git history but lose:

- why they were investigating
- what they already tried
- what evidence they gathered
- where they should continue

Ariadne exists to reduce re-orientation time with factual, local investigation memory.

## Product Principle

Build a local-first investigation memory layer.

Do not build:

- a Git history viewer
- repository analytics
- a productivity tracker
- an AI coding assistant

## Constraints

- Local-first only: no cloud, no accounts, no telemetry
- Privacy-safe capture: no source contents, keystrokes, clipboard, screenshots, terminal output
- Evidence over interpretation: capture facts, never infer human intent

## Core Entities

### Investigation

A bounded unit of work with:

- goal name
- optional developer checkpoint
- factual observed trail
- Git snapshots
- resume artifact

### Checkpoint

Developer-authored intent statement.

Ariadne does not invent this.

### Snapshot

The resume package that answers:

1. What was I trying to do?
2. Where did I stop?
3. What changed?
4. What should I open first?

## Current Capability Summary

Ariadne 0.0.1 currently provides:

- explicit investigation start
- retroactive save from rolling in-memory activity
- optional checkpoint update/clear
- factual VS Code event capture (active editor, selection, edit occurrence)
- local Git snapshot capture
- persisted investigation-scoped timeline and collapsed navigation graph
- saved/current Git comparison in Resume Snapshot
- conservative reopen plan for resume flow
- active investigation recovery on restart

## Implementation Scope

### In Scope (0.0.1)

- VS Code extension only
- one active investigation per workspace
- rolling local buffer for retroactive capture
- start/checkpoint/save-stop/resume lifecycle
- local JSON persistence
- resume snapshot focused on fast orientation

### Out of Scope (0.0.1)

- AI summaries
- semantic search
- embeddings
- repository-wide graphs
- browser history capture
- sync or team sharing
- dashboards and productivity scoring

## Lifecycle

NO INVESTIGATION -> ACTIVE -> CHECKPOINT (optional) -> SAVED -> RESUME -> ACTIVE

Requirements met:

- active investigations survive restart
- persisted state uses incremental safe writes
- context can be resumed without exact workspace reconstruction

## What Success Means

Ariadne is successful when developers continue interrupted investigations in minutes instead of reconstructing from scratch.

Primary metric direction:

- lower time to orientation
- lower time to first meaningful continuation
- fewer repeated investigation steps
