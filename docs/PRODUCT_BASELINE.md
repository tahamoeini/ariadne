# RepoTrail 0.0.1 — Product Baseline

## Product thesis

Developers often return to an interrupted investigation with the code and Git state still available but with the mental context gone. RepoTrail exists to preserve enough trustworthy context to make re-entry easier.

## User problem

After stepping away from a code investigation, a developer must often reconstruct:

- what they were trying to do
- where they were working
- what changed
- which files they actually touched
- where to continue

VS Code and Git preserve parts of that picture. RepoTrail preserves the investigation context around them.

## Core product job

Help a developer resume an interrupted code investigation after enough time has passed that reconstructing context is slower than continuing the work itself.

## Scope for 0.0.1

### Platform

- VS Code desktop only

### Data sources

- observed VS Code editor activity
- local Git state

### Core objects

- Investigation
- Rolling Buffer
- Checkpoint
- Snapshot

### Core actions

- Start Investigation
- Save Recent Activity as Investigation
- Add or Update Checkpoint
- Save and Stop Investigation
- List Saved Investigations
- Show Resume Snapshot
- Resume Investigation
- Delete Investigation
- Delete All RepoTrail Data
- Show Local Storage Location

### Non-goals

RepoTrail 0.0.1 does not add:

- AI
- graph visualization
- timeline dashboards or general activity dashboards
- browser integration
- cloud sync
- accounts
- team features
- exact workspace/session restore
- repository analysis features unrelated to re-entry

## Interaction model

### Explicit capture

`RepoTrail: Start Investigation` saves the current context and keeps the investigation active.

### Retroactive capture

`RepoTrail: Save Recent Activity as Investigation` turns the current rolling-buffer evidence into a saved investigation and keeps it active.

### Optional checkpoint

The checkpoint is the developer-authored note. RepoTrail may preserve it, update it, or clear it, but RepoTrail must not invent it.

### Leave and return

When the developer comes back later, RepoTrail supports two resume steps:

- **Remember**: open the read-only Resume Snapshot
- **Reopen**: reopen a conservative set of saved files and move to the last saved location when possible

RepoTrail 0.0.1 does not promise exact restoration of tabs, layout, terminals, or mental state.

## Evidence over interpretation

RepoTrail records factual observations such as:

- a file was edited
- a file was revisited
- the sequence of file transitions within one Investigation
- the last saved location was `file:line:column`
- a checkpoint was added or cleared
- a Git snapshot was captured
- the Investigation was saved or resumed
- Git state changed between save time and resume time

RepoTrail must not turn those facts into unsupported labels such as:

- important file
- relevant file
- high-priority file

Human meaning remains human-supplied through the investigation name and optional checkpoint.

## Timeline boundary

RepoTrail may retain a small factual timeline when that improves re-entry, but the boundary stays the Investigation itself.

- The timeline exists only inside one saved Investigation.
- Timeline entries remain factual: file transitions, edit events, checkpoint changes, Git snapshots, and save/resume points.
- Noise is collapsed rather than logged exhaustively.
- RepoTrail must not infer relevance, intent, priority, or architectural meaning from that sequence.
- Graph visualization remains deferred until validation shows that the timeline alone is insufficient for re-entry.

## Privacy and local trust

- all RepoTrail data is local-only
- the rolling buffer remains in memory only
- saved investigations persist only the data needed for re-entry
- RepoTrail does not capture source contents, terminal contents, keystrokes, clipboard data, screenshots, or unrelated application activity
- RepoTrail makes no network requests

## Validation hypotheses

- **H1: Re-entry utility** — RepoTrail helps developers resume interrupted investigations faster or with fewer reconstruction mistakes than the baseline workflow.
- **H2: Capture sufficiency** — factual editor activity, Git state, and an optional checkpoint provide enough context for useful re-entry.
- **H3: Natural behavior** — RepoTrail fits into normal work without requiring heavy manual curation.

## Roadmap philosophy

RepoTrail 0.0.1 should stay narrow. If the product hypothesis is weak, the next step is to learn from validation, not to rescue the milestone by adding AI, graphs, dashboards, or unrelated integrations.
