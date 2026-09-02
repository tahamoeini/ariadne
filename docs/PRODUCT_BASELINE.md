# Ariadne 0.0.1 — Product Baseline

## Product thesis

Developers often return to an interrupted investigation with the code and Git state still available but with the mental context gone. Ariadne exists to preserve enough trustworthy context to make re-entry easier.

## User problem

After stepping away from a code investigation, a developer must often reconstruct:

- what they were trying to do
- where they were working
- what changed
- which files they actually touched
- where to continue

VS Code and Git preserve parts of that picture. Ariadne preserves the investigation context around them.

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
- Browser Reference
- Snapshot

### Core actions

- Start Investigation
- Save Recent Activity as Investigation
- Add or Update Checkpoint
- Attach Current Page to Ariadne
- Save and Stop Investigation
- List Saved Investigations
- Show Resume Snapshot
- Resume Investigation
- Delete Investigation
- Delete All Ariadne Data
- Show Local Storage Location

### Non-goals

Ariadne 0.0.1 does not add:

- AI
- graph visualization
- repository-wide dependency graphs or architecture maps
- timeline dashboards or general activity dashboards
- automatic browser-history import or page-content capture
- cloud sync
- accounts
- team features
- exact workspace/session restore
- repository analysis features unrelated to re-entry

## Interaction model

### Explicit capture

`Ariadne: Start Investigation` saves the current context and keeps the investigation active.

### Retroactive capture

`Ariadne: Save Recent Activity as Investigation` turns the current rolling-buffer evidence into a saved investigation and keeps it active.

### Optional checkpoint

The checkpoint is the developer-authored note. Ariadne may preserve it, update it, or clear it, but Ariadne must not invent it.

### Leave and return

When the developer comes back later, Ariadne supports two resume steps:

- **Remember**: open the read-only Resume Snapshot
- **Reopen**: reopen a conservative set of saved files and move to the last saved location when possible

Ariadne 0.0.1 does not promise exact restoration of tabs, layout, terminals, or mental state.

## Evidence over interpretation

Ariadne records factual observations such as:

- a file was edited
- a file was revisited
- the sequence of file transitions within one Investigation
- the collapsed navigation relationships around those file transitions within one Investigation
- the last saved location was `file:line:column`
- a checkpoint was added or cleared
- a Git snapshot was captured
- the Investigation was saved or resumed
- Git state changed between save time and resume time
- the developer deliberately attached an external page reference to the Investigation

Ariadne must not turn those facts into unsupported labels such as:

- important file
- relevant file
- high-priority file

Human meaning remains human-supplied through the investigation name and optional checkpoint.

## External reference boundary

Ariadne may retain a small set of deliberately attached browser references when that improves re-entry, but the boundary stays the Investigation itself.

- References exist only inside one saved Investigation.
- Capture is explicit, not automatic.
- Ariadne may offer the current open page or a temporary list of open page candidates, but the developer chooses what to attach.
- Captured fields remain minimal: URL, title, capture timestamp, and the associated Investigation by containment.
- Ariadne does not capture page contents, browser history, tab history, screenshots, or browsing analytics.
- Ariadne must not evolve this feature into a general browser memory product.

## Timeline boundary

Ariadne may retain a small factual timeline when that improves re-entry, but the boundary stays the Investigation itself.

- The timeline exists only inside one saved Investigation.
- Timeline entries remain factual: file transitions, edit events, checkpoint changes, Git snapshots, and save/resume points.
- Noise is collapsed rather than logged exhaustively.
- Ariadne must not infer relevance, intent, priority, or architectural meaning from that sequence.
- Graph visualization remains deferred even though the product now retains a small Investigation navigation graph for Resume.

## Navigation graph boundary

Ariadne may retain a small Investigation-scoped navigation graph when it improves Resume, but it stays bounded to factual observed movement.

- The graph exists only inside one saved Investigation.
- Nodes represent observed Investigation artifacts, currently file-backed editor artifacts only.
- Edges represent factual observed transitions or supported navigation relationships only.
- Noise is aggressively collapsed into counts and recent-neighbor evidence instead of preserving every movement.
- Ariadne must not infer repository architecture, dependency structure, intent, or code importance from the graph.
- The graph exists to support Resume ordering and understanding, not to become a decorative analytics surface.

## Privacy and local trust

- all Ariadne data is local-only
- the rolling buffer remains in memory only
- saved investigations persist only the data needed for re-entry
- deliberate external references, when attached, persist only minimal page metadata needed for re-entry
- Ariadne does not capture source contents, terminal contents, keystrokes, clipboard data, screenshots, or unrelated application activity
- Ariadne makes no network requests

## Validation hypotheses

- **H1: Re-entry utility** — Ariadne helps developers resume interrupted investigations faster or with fewer reconstruction mistakes than the baseline workflow.
- **H2: Capture sufficiency** — factual editor activity, Git state, an optional checkpoint, and a small number of deliberate external references provide enough context for useful re-entry.
- **H3: Natural behavior** — Ariadne fits into normal work without requiring heavy manual curation.

## Roadmap philosophy

Ariadne 0.0.1 should stay narrow. If the product hypothesis is weak, the next step is to learn from validation, not to rescue the milestone by adding AI, graph visualization, repository analysis, dashboards, or unrelated integrations.
