# RepoTrail 0.0.1 — Validation Plan

## Product Hypotheses

### H1: Re-Entry Utility

Developers who resume an interrupted code investigation with RepoTrail context recover their mental model faster than those without it.

### H2: Capture Sufficiency

The combination of observed activity trail, Git state snapshot, optional developer checkpoint, a condensed investigation timeline, an Investigation-scoped navigation graph, and a small number of deliberate external references captures enough context to support re-entry without requiring exhaustive logging or AI interpretation.

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
- **C vs. B:** Does the observed activity trail plus condensed timeline add value beyond checkpoint + Git?
- **D vs. C:** Is the developer checkpoint necessary, or is passive capture sufficient?
- **C vs. E:** Does the full RepoTrail experience improve re-entry over baseline?

## Timeline Validation Result

Validation evidence from timeline-focused Resume testing indicated that developers still needed a spatial representation of how they moved through an Investigation.

- The timeline remains part of the product because it preserves sequence honestly.
- The graph was added only after that evidence showed the timeline alone was insufficient for some resume tasks.

## Navigation Graph Validation Gate

Before expanding the graph beyond the current Investigation-scoped Resume support, validate whether the graph materially improves re-entry.

- Compare Resume behavior with and without graph-guided reopen ordering while holding the rest of the Investigation surface constant.
- Measure whether developers reopen the right neighboring artifacts faster and with fewer false starts.
- Confirm that the textual graph inside the Resume Snapshot is understandable without becoming noisy analytics.
- Treat repository-wide graph work, visualization work, and richer inferred relationships as blocked unless the current graph proves useful first.

## Evaluation Metrics (Future)

Metrics to be defined before validation begins. Candidates include:

- Time to first edit after resuming.
- Self-reported confidence in understanding where they left off.
- Number of re-exploration actions (reopening files already visited).
- Perceived usefulness rating.

## Assumptions Still Needing Testing

1. Developers actually experience painful context loss when resuming interrupted investigations.
2. The types of events RepoTrail captures are the ones that matter for re-entry.
3. A rolling buffer window is sufficient — developers don't need activity from days ago.
4. Optional checkpoints are written often enough to be useful.
5. The overhead of RepoTrail running passively is acceptable (performance, distraction).
6. A condensed investigation-scoped timeline improves sequence reconstruction without becoming noisy telemetry.
7. A collapsed Investigation-scoped navigation graph improves resume decisions without being mistaken for repository architecture.
8. Deliberately attached external references improve re-entry without creating pressure for automatic browser capture.

## Browser Reference Validation Gate

Before adding anything beyond explicit attachment, validate whether minimal browser references actually improve re-entry.

- Compare resume performance with and without attached external references while keeping the rest of the Investigation surface constant.
- Measure whether developers use the attached references during re-entry, or whether checkpoint plus timeline plus graph already cover the same need.
- Confirm that explicit attachment feels lightweight enough that developers will actually use it when a web reference matters.
- Treat browser-history import, content capture, sync, and broader browser-extension behavior as blocked unless this minimal deliberate model proves necessary and useful first.
