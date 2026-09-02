# Ariadne 0.0.1 — Validation Plan

## Product Hypotheses

### H1: Re-Entry Utility

Developers who resume an interrupted code investigation with Ariadne context recover their mental model faster than those without it.

### H2: Capture Sufficiency

The combination of observed activity trail, Git state snapshot, optional developer checkpoint, a condensed investigation timeline, an Investigation-scoped navigation graph, and a small number of deliberate external references captures enough context to support re-entry without requiring exhaustive logging or AI interpretation.

### H3: Natural Behavior

Developers use Ariadne without significant changes to their existing workflow. Capture is passive (observed events), and the only active step (Checkpoint) is optional and lightweight.

## Planned Comparison Variants

| Variant | Description |
|---------|-------------|
| **A** | Checkpoint only — developer writes a note before stopping. |
| **B** | Checkpoint + Git — developer note plus Git state snapshot. |
| **C** | Checkpoint + Git + observed trail — full Ariadne experience. |
| **D** | Git + observed trail without checkpoint — no developer note. |
| **E** | Normal VS Code + Git baseline — no Ariadne at all. |

## What Each Variant Tests

- **A vs. E:** Does any structured checkpoint help re-entry?
- **B vs. A:** Does adding Git context to a checkpoint improve re-entry?
- **C vs. B:** Does the observed activity trail plus condensed timeline add value beyond checkpoint + Git?
- **D vs. C:** Is the developer checkpoint necessary, or is passive capture sufficient?
- **C vs. E:** Does the full Ariadne experience improve re-entry over baseline?

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
2. The types of events Ariadne captures are the ones that matter for re-entry.
3. A rolling buffer window is sufficient — developers don't need activity from days ago.
4. Optional checkpoints are written often enough to be useful.
5. The overhead of Ariadne running passively is acceptable (performance, distraction).
6. A condensed investigation-scoped timeline improves sequence reconstruction without becoming noisy telemetry.
7. A collapsed Investigation-scoped navigation graph improves resume decisions without being mistaken for repository architecture.
8. Deliberately attached external references improve re-entry without creating pressure for automatic browser capture.

## Browser Reference Validation Gate

Before adding anything beyond explicit attachment, validate whether minimal browser references actually improve re-entry.

- Compare resume performance with and without attached external references while keeping the rest of the Investigation surface constant.
- Measure whether developers use the attached references during re-entry, or whether checkpoint plus timeline plus graph already cover the same need.
- Confirm that explicit attachment feels lightweight enough that developers will actually use it when a web reference matters.
- Treat browser-history import, content capture, sync, and broader browser-extension behavior as blocked unless this minimal deliberate model proves necessary and useful first.

## External Validation Build (Milestone G)

Run interruption-recovery studies with real tasks and delayed resumes.

### Study Setup

1. Recruit developers who regularly debug or investigate unfamiliar code paths.
2. Use a fixed task bank (bug triage, regression root-cause, behavior tracing).
3. Enforce interruption windows of 48-72 hours before resume sessions.
4. Randomize variants A-E per task to reduce ordering bias.

### Session Protocol

1. Participant performs investigation for a fixed initial window (20-40 minutes).
2. Participant stops with assigned variant condition.
3. After interruption delay, participant returns and resumes.
4. Capture timing and confidence outcomes.

### Primary Metrics

- Time to orientation:
	- from resume start to participant stating a concrete current hypothesis.
- Time to first meaningful continuation:
	- from resume start to first non-trivial code or test action advancing the investigation.
- Goal recall fidelity:
	- participant can explain prior goal accurately without re-exploration.
- Rework rate:
	- number of repeated exploratory steps that were already performed previously.

### Secondary Metrics

- Perceived resume usefulness (Likert scale).
- Perceived cognitive load during resume.
- Number of files opened before first meaningful continuation.

### Guardrails

- Do not optimize for event count or UI density.
- Treat any feature requests outside MVP scope as deferred hypotheses.
- Keep privacy boundary fixed throughout validation.

## Instrumentation Notes

For validation, prefer lightweight manual or local scripts that do not alter Ariadne's local-first privacy model.

- Session timers can be captured by facilitator tooling outside the extension.
- Ariadne data exports, if needed, should remain local and user-initiated.
- Do not add telemetry pipelines for MVP validation.

## Exit Criteria for 0.0.1

Proceed to next milestone only if most participants in variant C show clear improvement over baseline E in both:

1. time to orientation
2. time to first meaningful continuation

If improvement is not clear, iterate on snapshot clarity and lifecycle friction before adding new feature classes.
