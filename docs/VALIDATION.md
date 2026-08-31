# RepoTrail 0.0.1 — Validation Plan

## Product Hypotheses

### H1: Re-Entry Utility

Developers who resume an interrupted code investigation with RepoTrail context recover their mental model faster than those without it.

### H2: Capture Sufficiency

The combination of observed activity trail, Git state snapshot, and optional developer checkpoint captures enough context to meaningfully support re-entry — without requiring exhaustive logging or AI interpretation.

### H3: Natural Behavior

Developers use RepoTrail without significant changes to their existing workflow. Capture is passive (observed events), and the only active step (Checkpoint) is optional and lightweight.

## Planned Comparison Variants

| Variant | Description |
|---------|-------------|
| **A** | Checkpoint only — developer writes a note before stopping. |
| **B** | Checkpoint + Git — developer note plus Git state snapshot. |
| **C** | Checkpoint + Git + observed trail — full RepoTrail experience. |
| **D** | Git + observed trail without checkpoint — no developer note. |
| **E** | Normal VS Code + Git baseline — no RepoTrail at all. |

## What Each Variant Tests

- **A vs. E:** Does any structured checkpoint help re-entry?
- **B vs. A:** Does adding Git context to a checkpoint improve re-entry?
- **C vs. B:** Does the observed activity trail add value beyond checkpoint + Git?
- **D vs. C:** Is the developer checkpoint necessary, or is passive capture sufficient?
- **C vs. E:** Does the full RepoTrail experience improve re-entry over baseline?

## Evaluation Metrics (Future)

Metrics to be defined before validation begins. Candidates include:

- Time to first meaningful edit after resuming.
- Self-reported confidence in understanding where they left off.
- Number of re-exploration actions (reopening files already visited).
- Perceived usefulness rating.

## Assumptions Still Needing Testing

1. Developers actually experience painful context loss when resuming interrupted investigations.
2. The types of events RepoTrail captures are the ones that matter for re-entry.
3. A rolling buffer window is sufficient — developers don't need activity from days ago.
4. Optional checkpoints are written often enough to be useful.
5. The overhead of RepoTrail running passively is acceptable (performance, distraction).
