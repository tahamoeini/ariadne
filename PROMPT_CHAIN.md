# Ariadne — AI Coding Agent Prompt Chain

> **Purpose:** Build Ariadne `0.0.1` incrementally with AI coding agents while preserving product scope, architectural decisions, implementation state, and validation intent across separate chats and different agents.

This document is **not** the product specification itself.

The authoritative product definition must live separately in:

```text
docs/PRODUCT_BASELINE.md
```

That file should contain the frozen Ariadne product strategy and roadmap.

This document tells an AI coding agent **how to implement that strategy safely, incrementally, and without losing context**.

---

# 1. Core Rule

Every coding-agent session must follow this sequence:

```text
Read source-of-truth docs
        ↓
Inspect current repository
        ↓
Read previous handoff
        ↓
Work on exactly one milestone
        ↓
Run verification/tests
        ↓
Update documentation
        ↓
Update AGENT_HANDOFF.md
        ↓
Stop
```

Never rely on chat history as the authoritative project memory.

Chat history is temporary.

The repository is the memory.

---

# 2. Source-of-Truth Files

Ariadne should maintain these files:

```text
docs/
├── PRODUCT_BASELINE.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── VALIDATION.md
└── AGENT_HANDOFF.md
```

## `PRODUCT_BASELINE.md`

Contains the frozen product strategy.

It defines:

* product thesis,
* user problem,
* Ariadne job,
* MVP scope,
* non-goals,
* core objects,
* privacy principles,
* validation hypotheses,
* roadmap philosophy.

Agents must **not silently change this file**.

If implementation reveals a contradiction or impossible requirement, document the issue rather than rewriting the product.

---

## `ARCHITECTURE.md`

Contains the current technical structure.

Examples:

```text
extension modules
storage mechanism
domain model
event pipeline
Git adapter
VS Code adapters
commands
UI surfaces
test structure
```

This document evolves with implementation.

---

## `DECISIONS.md`

Contains important technical decisions and their rationale.

Example:

```text
ADR-001
Use bounded event buffer rather than permanent raw telemetry.

Reason:
Ariadne is a context-recovery tool, not an exhaustive activity logger.
```

Agents should append important decisions rather than repeatedly reconsidering them.

---

## `VALIDATION.md`

Contains:

* H1: re-entry utility,
* H2: capture sufficiency,
* H3: natural product behavior,
* planned experiment variants,
* future evaluation metrics,
* assumptions that still need testing.

Implementation work must not quietly redefine product success.

---

## `AGENT_HANDOFF.md`

This is the most important continuity file.

Every agent must read it before coding and update it before stopping.

It should always contain:

```text
Current milestone

Status

What was completed

What remains

Files changed

Important implementation details

Known issues

Tests/status

Decisions made

Next recommended action

Do not touch / deferred items
```

A completely new AI chat should be able to read this file and continue.

---

# 3. Universal Agent Rules

Include these rules in every implementation prompt.

## Product discipline

Do not add functionality outside the current Ariadne `0.0.1` scope.

Specifically do not introduce:

* AI,
* LLMs,
* SLMs,
* embeddings,
* cloud services,
* accounts,
* authentication,
* browser extensions,
* GitHub/GitLab integrations,
* graph visualizations,
* team functionality,
* productivity scoring,
* semantic importance scoring,
* repository intelligence,
* terminal recording,
* DriftMap features.

If something would be useful later, document it under:

```text
Deferred / future considerations
```

Do not implement it.

---

## Evidence over interpretation

Ariadne may record facts such as:

```text
file visited 6 times
file edited
definition navigation observed
branch changed
Git state changed
```

Ariadne must not convert these facts into unsupported claims such as:

```text
important file
relevant code
developer was confused
high-risk component
core investigation file
```

Human intent must remain human-supplied.

---

## Privacy

Do not capture:

* keystrokes,
* clipboard contents,
* screenshots,
* source-code contents unless technically required for a narrow operation,
* terminal contents,
* environment variables,
* credentials,
* secrets,
* unrelated applications,
* unrelated repositories.

Store the minimum information necessary for context recovery.

---

## Engineering discipline

Before changing code:

1. inspect the repository,
2. understand existing architecture,
3. reuse existing patterns,
4. avoid unnecessary dependencies,
5. avoid unrelated refactoring.

Do not rewrite functioning code merely because another architecture looks cleaner.

---

## Version-sensitive APIs

For VS Code or Node APIs whose exact behavior may depend on current versions:

* verify against official documentation,
* do not invent APIs,
* document compatibility assumptions.

---

## Testing

Every milestone must include relevant automated tests where practical.

At minimum verify:

```text
happy path
empty state
invalid/missing Git repository
workspace changes
extension restart where relevant
storage recovery
unexpected/malformed stored data where relevant
```

Never weaken tests simply to make implementation pass.

---

# 4. How to Use This Prompt Chain

Run the prompts **in order**.

Do not paste the entire chain into one coding-agent session.

Use:

```text
Prompt 0
↓
review output
↓
Prompt 1
↓
review output
↓
Prompt 2
...
```

Each prompt has an entry condition.

Only proceed when that condition is satisfied.

If you start a new chat, use the **New Chat Bootstrap Prompt** before the relevant milestone prompt.

---

# 5. New Chat Bootstrap Prompt

Use this at the beginning of **every new coding-agent conversation**.

```text
You are continuing development of Ariadne.

Do not assume previous chat history is available or authoritative.

Before doing any implementation work:

1. Read:
   - docs/PRODUCT_BASELINE.md
   - docs/ARCHITECTURE.md
   - docs/DECISIONS.md
   - docs/VALIDATION.md
   - docs/AGENT_HANDOFF.md

2. Inspect the current repository structure and Git status.

3. Compare the repository state with AGENT_HANDOFF.md.

4. Identify:
   - current milestone,
   - completed work,
   - incomplete work,
   - known issues,
   - tests currently passing/failing,
   - deferred items.

5. Do not begin a new milestone if the previous milestone is incomplete.

6. Do not expand Ariadne beyond the scope defined in PRODUCT_BASELINE.md.

7. Human intent must remain human-supplied. Observed activity must remain factual.

8. Ariadne is not an exhaustive developer activity logger. Its purpose is to preserve enough context to help resume an interrupted code investigation.

After inspecting everything, briefly state your understanding of the current project state and then perform only the task given in the next prompt.

If repository state contradicts AGENT_HANDOFF.md, trust the repository and explicitly document the discrepancy.
```

---

# PROMPT 0 — Establish Project Memory

## Run when

Before meaningful implementation begins.

## Goal

Create the persistent documentation structure that allows future agents to continue without chat history.

## Prompt

```text
We are beginning implementation of Ariadne 0.0.1.

First read docs/PRODUCT_BASELINE.md completely.

Do not implement product functionality yet.

Your task is to establish the repository's persistent project-memory system.

Create or normalize these files:

docs/ARCHITECTURE.md
docs/DECISIONS.md
docs/VALIDATION.md
docs/AGENT_HANDOFF.md

Do not modify the product strategy in PRODUCT_BASELINE.md except for formatting fixes if absolutely necessary.

ARCHITECTURE.md should initially contain:

- current technical assumptions,
- proposed module boundaries,
- event capture concept,
- rolling-buffer concept,
- Investigation / Checkpoint / Snapshot concepts,
- Git adapter boundary,
- storage boundary,
- UI/command boundary,
- testing strategy,
- unresolved technical questions.

Keep architecture deliberately simple.
Do not design future browser/cloud/team functionality.

DECISIONS.md should begin with initial ADR-style decisions including:

- VS Code only,
- local Git only,
- local-only storage,
- no AI,
- no graph in 0.0.1,
- no exhaustive activity logging,
- factual observations instead of semantic interpretation,
- Git enriches context rather than becoming the product.

VALIDATION.md should preserve the three product hypotheses:

H1: re-entry utility
H2: capture sufficiency
H3: natural behavior

Also include the planned comparison:

A: checkpoint only
B: checkpoint + Git
C: checkpoint + Git + observed trail
D: Git + observed trail without checkpoint
E: normal VS Code + Git baseline

AGENT_HANDOFF.md should contain:

- milestone: project initialization,
- current status,
- what has been prepared,
- what remains,
- known risks,
- next milestone.

Do not build extension features yet.

At the end:

1. show the files created/changed,
2. summarize unresolved technical decisions,
3. confirm that no product scope has been added,
4. update AGENT_HANDOFF.md.
```

## Exit condition

Proceed only when all continuity files exist and accurately reflect the product baseline.

---

# PROMPT 1 — Scaffold the VS Code Extension

## Entry condition

Prompt 0 completed.

## Goal

Produce the smallest working extension skeleton.

## Prompt

```text
Continue Ariadne development.

First follow the project bootstrap process:

- read PRODUCT_BASELINE.md,
- ARCHITECTURE.md,
- DECISIONS.md,
- VALIDATION.md,
- AGENT_HANDOFF.md,
- inspect repository and Git status.

Current milestone:

Create the minimal Ariadne VS Code extension scaffold.

Requirements:

1. Use TypeScript.

2. Use the current officially supported VS Code extension development approach.

3. Verify version-sensitive setup details against official VS Code documentation rather than guessing.

4. Keep dependencies minimal.

5. The extension must:
   - load successfully,
   - expose a simple Ariadne command,
   - allow verification that activation works,
   - have a basic test setup.

6. Do NOT yet implement:
   - event tracking,
   - Git integration,
   - Investigation storage,
   - Snapshot UI,
   - graphs,
   - browser integration,
   - AI.

7. Establish a clear source structure suitable for later modules such as:

   domain/
   capture/
   git/
   storage/
   commands/
   ui/

Use these names only if they fit naturally; do not force architecture for cosmetic reasons.

8. Add standard developer documentation:
   - how to install dependencies,
   - run extension locally,
   - run tests,
   - build/package where appropriate.

9. Ensure lint/typecheck/test commands work.

10. Avoid unrelated tooling.

Verification:

- extension compiles,
- extension launches in Extension Development Host,
- basic command executes,
- automated tests pass.

Update:

- docs/ARCHITECTURE.md with actual project structure,
- docs/DECISIONS.md with any significant tooling decisions,
- docs/AGENT_HANDOFF.md with exact status.

Stop after the extension scaffold is verified.
Do not begin event capture.
```

## Exit condition

A minimal extension launches, tests run, and documentation reflects reality.

---

# PROMPT 2 — Implement Core Domain Model and Local Persistence

## Goal

Create Investigation, Checkpoint, Snapshot, and persistence concepts without yet capturing real VS Code events.

## Prompt

```text
Continue Ariadne development from the current handoff.

Read all project memory files and inspect repository state first.

Current milestone:

Implement the core Ariadne domain model and local persistence.

Implement only the minimum models needed for 0.0.1.

Core concepts:

Investigation
Checkpoint
Snapshot
GitSnapshot
ObservedEvent

Suggested factual fields may include:

Investigation:
- id
- name
- workspace identifier/path
- repository identifier/path if available
- createdAt
- savedAt
- lastResumedAt
- optional checkpoint
- snapshot

Checkpoint:
- text
- createdAt

ObservedEvent:
- timestamp
- factual event type
- workspace
- file path where relevant
- source metadata required for the factual event

Snapshot:
- investigation metadata
- edited files
- visited file counts
- last location
- recent observed path
- Git snapshot

GitSnapshot:
- timestamp
- HEAD
- branch
- modified files
- untracked files
- diff statistics

Do not add semantic fields such as:

importance
relevanceScore
riskScore
reasoningSummary
developerIntent
confusionScore

Persistence requirements:

- local only,
- resilient to extension restart,
- simple and inspectable,
- no cloud,
- no external database service.

Choose the simplest maintainable persistence mechanism appropriate for a VS Code extension.

Do not over-engineer with a database server or repository abstraction zoo.

Add tests covering:

- creating Investigation objects,
- optional checkpoint,
- serialization/deserialization,
- empty state,
- malformed or old persisted data where reasonably relevant,
- deletion/update where required.

Do not implement live event capture yet.

Update ARCHITECTURE.md with:

- actual model,
- storage location/mechanism,
- schema/versioning approach if one is required.

Record material decisions in DECISIONS.md.

Update AGENT_HANDOFF.md.

Stop after domain and persistence tests pass.
```

## Exit condition

Investigations can be created, persisted, reloaded, and tested without real telemetry.

---

# PROMPT 3 — Implement the Rolling Event Buffer

## Goal

Capture recent factual VS Code activity without permanently logging everything.

## Prompt

```text
Continue Ariadne from the documented repository state.

Read all project memory files first.

Current milestone:

Implement the bounded rolling event buffer.

Product principle:

Ariadne is NOT a historical record of everything a developer did.

The buffer exists only to preserve enough recent context to create or enrich an Investigation.

Initial buffer duration:

20 minutes.

Make this internally configurable if inexpensive, but do not build settings UI unless needed.

Capture only factual VS Code events necessary for the MVP.

Prioritize:

- active editor/file changes,
- workspace/repository context,
- edit occurrence,
- meaningful last cursor/location information,
- definition/reference navigation only if reliably identifiable using supported VS Code APIs,
- timestamps.

Do NOT capture:

- keystrokes,
- file contents,
- clipboard,
- terminal contents,
- screenshots,
- environment variables,
- unrelated application activity.

Important:

Do not persist an endless raw event stream.

Implement bounded retention based on time.

Design the event model so that multiple rapid events can later be summarized without inventing semantic importance.

Tests should cover:

- events entering buffer,
- events older than retention window being removed,
- correct ordering,
- workspace/file transitions,
- edit occurrence,
- empty buffer,
- extension restart behavior according to chosen design,
- noisy rapid transitions.

Provide a developer/debug mechanism for inspecting captured factual events during development, but do not turn it into user-facing analytics.

Update ARCHITECTURE.md and AGENT_HANDOFF.md.

Record any significant event-capture decisions in DECISIONS.md.

Stop after the rolling buffer is functioning and tested.

Do not create Resume UI yet.
```

## Exit condition

Recent VS Code activity is captured accurately enough and bounded to the intended retention window.

---

# PROMPT 4 — Implement Local Git Snapshot

## Goal

Capture Git state at a point in time without turning Ariadne into a Git client.

## Prompt

```text
Continue Ariadne development.

Read all source-of-truth files and current handoff before changing code.

Current milestone:

Implement lightweight local Git Snapshot support.

Ariadne should capture factual Git context only.

For a repository, capture where available:

- repository root,
- HEAD commit,
- current branch,
- modified files,
- untracked files,
- diff statistics,
- timestamp.

If no Git repository exists:

- Ariadne must continue functioning,
- return a clear no-Git state,
- do not fail the entire Investigation workflow.

Do not implement:

- commit graph,
- blame UI,
- ownership analysis,
- co-change,
- churn,
- hotspots,
- GitHub/GitLab APIs,
- remote repository operations.

Important distinction:

Git state when an Investigation is saved is different from Git state when it is resumed.

The model must support later comparison between:

THEN
and
NOW.

Use local Git through the simplest reliable approach consistent with the project architecture.

Handle:

- detached HEAD,
- no commits where practical,
- missing Git executable if relevant,
- repository with many changed files,
- spaces/special characters in paths.

Avoid shell-command injection risks when invoking Git.

Add automated tests around Git parsing/business logic where possible.
Use integration tests carefully if environment-dependent.

Update:

- ARCHITECTURE.md,
- DECISIONS.md,
- AGENT_HANDOFF.md.

Stop after Git snapshot functionality is verified.

Do not build historical Git analytics.
```

## Exit condition

Ariadne can reliably produce a lightweight Git Snapshot or a valid no-Git state.

---

# PROMPT 5 — Build Investigation Lifecycle

## Goal

Make explicit and retroactive Investigation creation functional.

## Prompt

```text
Continue Ariadne.

Read all project documentation and inspect the existing implementation first.

Current milestone:

Implement the Investigation lifecycle.

Required user flows:

1. Create/Save Investigation from current activity.

2. Create Investigation retroactively from the rolling buffer:
   "Save Recent Activity as Investigation"

3. Add or update an optional Checkpoint.

4. Save/stop an Investigation.

5. List saved Investigations.

6. Delete an Investigation.

Do not add complicated workflow states.

The product should work when the developer performs almost no manual curation.

Investigation creation should combine:

- user-supplied Investigation name,
- optional Checkpoint,
- relevant buffered observed events,
- current Git Snapshot,
- last known location,
- factual visited/edit evidence.

For visited files:

store factual counts.

Example:

tokenService.ts — 6 visits

Do not produce labels such as:

important
core
high relevance

If Pin File already exists in the model, keep it optional and minimal.
If it adds disproportionate complexity, defer it and record that decision.

Provide VS Code commands through an appropriate simple UI such as Command Palette.

Do not build a custom complex UI yet.

Add tests for:

- explicit Investigation creation,
- retroactive creation,
- empty rolling buffer,
- checkpoint present/absent,
- no Git repository,
- persistence after extension restart,
- deletion.

Update documentation and handoff.

Stop after Investigation lifecycle works end-to-end through simple VS Code commands.

Do not build the final Resume Snapshot UI yet.
```

## Exit condition

A developer can create, save, list, and delete Investigations, including from recent activity.

---

# PROMPT 6 — Build the Resume Snapshot

## Goal

Create Ariadne's first real user-facing value surface.

## Prompt

```text
Continue Ariadne from the current handoff.

Read all project-memory files and inspect the repository first.

Current milestone:

Build the Resume Snapshot.

This is the primary Ariadne 0.0.1 product surface.

The Resume Snapshot should prioritize re-entry context, not telemetry volume.

Display roughly in this order:

1. Investigation name

2. Checkpoint
   only if supplied by the user

3. Saved timestamp

4. Workspace/repository

5. Branch when saved

6. Git state when saved

7. Current Git state

8. Differences between saved state and current state where factual and inexpensive to compute

9. Edited files

10. Revisited files with explicit visit counts

11. Pinned files if the feature exists

12. Last location

13. A short recent observed navigation path

Use factual wording.

Good:

"tokenService.ts — 6 visits"

Bad:

"tokenService.ts — highly relevant"

Good:

"3 modified files when saved"

Bad:

"3 risky changes"

Do not add:

- AI summary,
- importance ranking,
- productivity score,
- repository graph,
- giant timeline,
- semantic explanations.

The Snapshot must remain understandable in seconds.

Use a simple VS Code-native UI or lightweight webview only if needed.

Do not spend excessive time on visual polish before usability is proven.

Include:

- empty states,
- missing Git state,
- missing checkpoint,
- deleted/moved file handling,
- corrupted/missing Investigation handling.

Add tests for presentation logic where practical.

Update ARCHITECTURE.md and AGENT_HANDOFF.md.

Stop when a developer can select a saved Investigation and get a clear Resume Snapshot.
```

## Exit condition

Saved Investigations can be inspected through a concise and honest Resume Snapshot.

---

# PROMPT 7 — Implement Resume Actions

## Goal

Help the developer continue rather than merely inspect historical data.

## Prompt

```text
Continue Ariadne development.

Read the full project context and current handoff first.

Current milestone:

Implement conservative Resume actions.

Ariadne should distinguish:

REMEMBER
display previously observed state

REOPEN
open resources where VS Code reliably supports it

RESTORE
only use this term where exact state restoration is genuinely supported

For Ariadne 0.0.1, implement only reliable reopen behavior.

Potential actions:

- open the original workspace if appropriate and supported,
- reopen relevant/edited files,
- open the last active file,
- reveal or move to the last meaningful recorded location if the file still exists.

Do not attempt to recreate a developer's mental state.

Do not fail if:

- a file was deleted,
- a file moved,
- workspace path disappeared,
- branch changed,
- repository changed.

Show clear partial-recovery behavior.

Avoid opening a huge number of files.

Choose a conservative limit or priority based on factual evidence such as:

- edited files,
- last file,
- manually pinned files if supported.

Do not infer semantic importance.

Test:

- successful resume,
- missing file,
- changed workspace,
- no Git,
- large Investigation,
- stale locations.

Update documentation and handoff.

Stop when Resume assists continuation reliably without making magical restoration promises.
```

## Exit condition

The user can reopen a preserved Investigation context using supported VS Code mechanisms.

---

# PROMPT 8 — Privacy, Data Control, and Failure Hardening

## Goal

Ensure Ariadne deserves the "local-first" claim.

## Prompt

```text
Continue Ariadne.

Read PRODUCT_BASELINE.md and all implementation documentation first.

Current milestone:

Harden privacy, local data control, and failure handling.

Verify that Ariadne 0.0.1:

- requires no account,
- makes no cloud requests,
- uses no analytics,
- uploads no repository data,
- stores no keystrokes,
- stores no clipboard data,
- stores no screenshots,
- stores no terminal content,
- does not intentionally persist full source-code contents.

Implement appropriate user controls for:

- deleting one Investigation,
- deleting all Ariadne data,
- viewing where local data is stored or otherwise clearly documenting it.

Review every persisted field and answer:

"Is this required for re-entry?"

If not, remove it unless there is a documented reason.

Review file paths, branch names, checkpoint text, and Git metadata as potentially sensitive data.

Make storage corruption/recovery safe.

Ensure malformed stored Investigations do not break extension activation.

Do not introduce encryption merely for appearance if the threat model and storage platform do not support it correctly.

Instead:

- document the actual security model,
- minimize sensitive storage,
- use platform-supported safe storage where appropriate.

Review logs/debug output to ensure sensitive data is not unnecessarily printed.

Add relevant tests.

Update:

- ARCHITECTURE.md,
- DECISIONS.md,
- AGENT_HANDOFF.md,
- README privacy section if appropriate.

Stop after privacy review and hardening are complete.
```

## Exit condition

Ariadne's actual implementation matches its local-first/minimal-data promise.

---

# PROMPT 9 — MVP Quality Pass

## Goal

Turn the prototype into a coherent `0.0.1` test build without adding features.

## Prompt

```text
Continue Ariadne from the current repository state.

Read all source-of-truth documentation and handoff first.

Current milestone:

Perform the Ariadne 0.0.1 quality pass.

This milestone is NOT for adding features.

Review the complete user flow:

normal coding
↓
rolling buffer
↓
explicit or retroactive Investigation save
↓
optional checkpoint
↓
leave
↓
open Ariadne later
↓
Resume Snapshot
↓
Resume action

Audit for:

- crashes,
- inconsistent states,
- duplicate events,
- excessive event capture,
- unclear command names,
- stale Git state,
- missing workspace,
- missing files,
- large file counts,
- malformed stored data,
- extension restart,
- multiple workspaces if relevant,
- repositories without Git,
- detached HEAD,
- usability friction.

Review copy.

Ensure wording remains factual.

Remove accidental interpretation such as:

important
relevant
high priority
meaningful file

unless the meaning was explicitly supplied by the user.

Run:

- type checking,
- linting,
- automated tests,
- build/package verification,
- extension-host smoke test.

Do not:

- add graph,
- add timeline dashboard,
- add browser integration,
- add AI,
- redesign architecture unless required by a demonstrated defect.

Update all documentation to match actual implementation.

AGENT_HANDOFF.md should state whether 0.0.1 is ready for external validation and list any remaining blockers.

Stop after quality verification.
```

## Exit condition

Ariadne `0.0.1` is stable enough for real-user validation.

---

# PROMPT 10 — Validation-Ready Build

## Goal

Prepare the software and materials needed to test the actual product hypothesis.

## Prompt

```text
Continue Ariadne.

Do not add product features.

Read:

PRODUCT_BASELINE.md
VALIDATION.md
AGENT_HANDOFF.md

Current milestone:

Prepare Ariadne 0.0.1 for controlled and natural-use validation.

Create concise tester documentation explaining:

What Ariadne does:

"Ariadne helps you resume an interrupted code investigation."

What it captures:

- VS Code navigation/activity required by the MVP,
- Git working state,
- optional checkpoint.

What it does not capture:

- keystrokes,
- clipboard,
- screenshots,
- terminal contents,
- cloud data.

Create a simple tester workflow:

1. install Ariadne,
2. work on a real investigation,
3. save explicitly or retroactively,
4. optionally add checkpoint,
5. stop working,
6. return after 24–72 hours,
7. open Resume Snapshot,
8. continue the investigation.

Do not bias testers by telling them which fields should be useful.

Prepare support for the validation variants defined in VALIDATION.md where practical:

A checkpoint only
B checkpoint + Git
C checkpoint + Git + trail
D Git + trail without checkpoint
E ordinary VS Code + Git baseline

Do not turn this into a complex experimentation platform.

If variants require configuration, implement the simplest safe mechanism.

Document which metrics must be collected manually versus automatically.

Ariadne should not quietly become an analytics tracker.

Prefer manual study recording for early tests.

Create:

docs/TESTER_GUIDE.md
docs/EXPERIMENT_PROTOCOL.md

Update AGENT_HANDOFF.md with:

- build/version,
- install procedure,
- known limitations,
- validation readiness.

Stop after preparing the testable build and experiment documentation.
```

## Exit condition

A developer who was not part of implementation can install Ariadne and participate in the intended experiment.

---

# 6. STOP GATE AFTER PROMPT 10

Do not automatically continue building.

At this point:

# Stop coding.

Use the product.

Test it.

Give it to developers.

Collect evidence.

Do **not** proceed directly to:

* graphs,
* timelines,
* browser extension,
* GitHub,
* richer Git analytics.

The next implementation prompt must be selected from evidence.

---

# 7. Post-MVP Decision Prompt

Run only after real usage data exists.

```text
We have completed Ariadne 0.0.1 and collected validation evidence.

Before proposing any new feature:

1. Read:
   - PRODUCT_BASELINE.md
   - VALIDATION.md
   - EXPERIMENT_PROTOCOL.md
   - AGENT_HANDOFF.md

2. Review the actual validation evidence provided.

3. Separate:
   - observed facts,
   - user comments,
   - assumptions,
   - hypotheses.

4. Evaluate H1:
   Did Ariadne improve re-entry?

5. Evaluate H2:
   Did passive VS Code/Git context add value beyond checkpoint and ordinary editor/Git restoration?

6. Evaluate H3:
   Did users voluntarily save and resume Investigations?

7. Identify the single largest remaining re-entry bottleneck.

8. Do not propose a feature merely because it was mentioned in the historical roadmap.

Potential outcomes include:

- continue current product,
- simplify Ariadne,
- remove passive tracking,
- improve checkpoint workflow,
- improve Resume Snapshot,
- add timeline,
- add graph,
- add web-reference capture,
- add richer Git evidence,
- radically reposition,
- stop the product.

Recommend the smallest next experiment that resolves the biggest uncertainty.

Do not implement anything yet.

Update VALIDATION.md and AGENT_HANDOFF.md with the evidence-based decision.
```

---

# 8. Optional Future Prompt — Timeline

Run only if user evidence demonstrates that developers struggle to reconstruct the sequence of investigation.

```text
Evidence from Ariadne validation indicates that developers need better reconstruction of the sequence of an Investigation.

Implement the smallest investigation-scoped timeline that addresses that need.

Do not create a general activity dashboard.

The timeline should show factual events such as:

file transitions
edit events
checkpoint
Git snapshot
save/resume points

Collapse noise.

Keep the Investigation as the boundary.

Do not infer relevance or intent.

Validate whether the timeline improves re-entry before adding a graph.

Update all project-memory documentation and handoff.
```

---

# 9. Optional Future Prompt — Navigation Graph

Run only if evidence shows a linear timeline does not sufficiently communicate investigation relationships.

```text
Validation evidence shows developers need a spatial representation of how they moved through an Investigation.

Implement an Investigation-scoped navigation graph.

Do not create a repository-wide dependency graph.

Nodes represent observed Investigation artifacts.

Edges represent factual observed transitions or supported navigation relationships.

Do not infer architectural dependency unless backed by explicit data.

The graph must answer:

"How did I move through this Investigation?"

not:

"How is this repository architected?"

Aggressively collapse noise.

The graph must support Resume rather than become a decorative analytics feature.

Test usefulness before expanding graph functionality.

Update documentation and handoff.
```

---

# 10. Optional Future Prompt — Browser References

Run only if validation repeatedly shows that developers lose important external references.

```text
Validation evidence shows that external web references are a recurring re-entry problem.

Design the smallest possible browser-reference integration.

Do not automatically import browsing history.

Prefer deliberate capture:

Attach current page to Ariadne

or

show temporary candidate references and let the developer choose what to attach.

Captured reference fields should remain minimal, such as:

URL
title
timestamp
associated Investigation

Do not capture page contents by default.

Do not introduce cloud synchronization.

Do not turn the browser extension into DriftMap.

The feature exists only to improve Ariadne Investigation re-entry.

Update product/architecture decisions and handoff.
```

---

# 11. Agent Handoff Template

Every coding agent must leave `docs/AGENT_HANDOFF.md` approximately like this:

```markdown
# Ariadne Agent Handoff

## Current Milestone

Prompt 4 — Local Git Snapshot

## Status

Completed / In Progress / Blocked

## Completed

- Implemented Git adapter.
- Captures HEAD.
- Captures branch.
- Captures modified/untracked files.
- Added diff-stat parsing.
- Added no-Git fallback.

## Remaining

- Detached HEAD test.
- Windows path handling test.

## Files Changed

- src/git/gitAdapter.ts
- src/git/types.ts
- src/git/gitAdapter.test.ts
- docs/ARCHITECTURE.md
- docs/DECISIONS.md

## Tests

Passing:
- unit tests
- typecheck

Pending/failing:
- detached HEAD integration test

## Important Implementation Details

Git commands are executed using argument arrays rather than shell-concatenated strings.

No Git metadata is sent externally.

## Decisions Made

ADR-006:
Use local Git CLI rather than GitHub/GitLab API.

## Known Issues

Repositories with zero commits require additional handling.

## Deferred

- blame
- co-change
- hotspots
- ownership
- commit graph

## Next Recommended Action

Finish detached-HEAD/no-commit handling, rerun test suite, then begin Prompt 5 only if all Prompt 4 exit criteria pass.
```

---

# 12. Decision Log Template

Use in `docs/DECISIONS.md`.

```markdown
## ADR-XXX — Decision title

### Status

Accepted

### Context

What problem required a decision?

### Decision

What was chosen?

### Reason

Why?

### Alternatives Considered

What reasonable alternatives were rejected?

### Consequences

What does this make easier/harder?

### Scope

Does this affect 0.0.1 only or establish a longer-term rule?
```

Do not write ADRs for trivial implementation details.

Use them for decisions a future agent might otherwise reopen.

---

# 13. Coding-Agent Definition of Done

A prompt is not complete because code was generated.

A milestone is complete only when:

```text
implementation works
+
tests pass
+
typecheck/lint pass
+
manual smoke test succeeds where relevant
+
documentation matches code
+
DECISIONS.md is updated when necessary
+
AGENT_HANDOFF.md is current
+
no unauthorized scope was added
```

If any of those are missing, the next agent should finish the current milestone rather than moving ahead.

---

# 14. Recovery Prompt When an Agent Goes Off Track

If an agent over-engineers or introduces unwanted scope, use:

```text
Stop implementation.

Read docs/PRODUCT_BASELINE.md and compare the current changes against the Ariadne 0.0.1 scope.

Ariadne currently exists only to help resume interrupted code Investigations using:

VS Code
+
local Git
+
local storage
+
Investigation
+
Checkpoint
+
Snapshot
+
Resume

Identify every current change that introduces unnecessary:

- AI,
- cloud,
- browser functionality,
- repository intelligence,
- analytics,
- graphing,
- semantic inference,
- generalized frameworks,
- premature abstractions,
- unrelated refactoring.

Do not delete valid existing functionality blindly.

Propose the smallest rollback/simplification required to return the implementation to the product baseline.

Preserve working code that directly supports the MVP.

After simplifying:

- run tests,
- update ARCHITECTURE.md,
- document reverted decisions if necessary,
- update AGENT_HANDOFF.md.
```

---

# 15. Bug-Fix Prompt

Use when a milestone implementation is broken.

```text
Treat this as a bug-fix task, not a feature-development opportunity.

First:

- read PRODUCT_BASELINE.md,
- read ARCHITECTURE.md,
- read DECISIONS.md,
- read AGENT_HANDOFF.md,
- inspect relevant code and tests.

Bug:

[PASTE BUG HERE]

Reproduce the issue before changing behavior where practical.

Identify:

- actual cause,
- affected scope,
- whether tests should already have caught it.

Implement the smallest correct fix.

Do not:

- weaken requirements,
- delete failing tests simply to pass CI,
- broadly refactor unrelated modules,
- add features.

Add or update regression tests.

Run the relevant full test suite.

Update AGENT_HANDOFF.md with:

- cause,
- fix,
- regression test,
- any remaining risk.
```

---

# 16. Code-Review Prompt

Use after a meaningful milestone or before testing externally.

```text
Review the current Ariadne implementation as a senior VS Code extension engineer and skeptical product engineer.

Read:

PRODUCT_BASELINE.md
ARCHITECTURE.md
DECISIONS.md
AGENT_HANDOFF.md

Do not redesign the product.

Review specifically for:

Correctness
- event ordering
- race conditions
- stale state
- persistence failures
- malformed data

Privacy
- excessive data capture
- source-code leakage
- sensitive logging
- unnecessary persistence

VS Code behavior
- activation/deactivation
- workspace changes
- extension restart
- missing files
- commands
- disposal of subscriptions/resources

Git
- command safety
- unusual repository states
- missing Git
- detached HEAD
- path handling

Architecture
- unnecessary dependencies
- premature abstraction
- coupling
- maintainability

Testing
- missing edge cases
- brittle tests
- untested critical behavior

Product integrity
- accidental semantic inference
- feature creep
- functionality already outside 0.0.1

Return findings grouped by:

Critical
High
Medium
Low

For each issue include:

- evidence,
- impact,
- recommended minimal fix.

Do not implement changes during this review.
```

---

# 17. Implementation-Fix Prompt After Review

```text
Use the latest Ariadne code-review findings.

Read the repository and all project-memory documents first.

Implement only:

Critical findings
High findings

Then address Medium findings only when the fix is small and low-risk.

Do not introduce new functionality.

For every change:

- preserve product behavior unless it is the defect,
- add regression tests,
- avoid unrelated refactoring.

Run complete verification.

Update:

ARCHITECTURE.md if behavior/structure changed,
DECISIONS.md if an architectural decision changed,
AGENT_HANDOFF.md with final status.

List any unresolved Medium/Low findings explicitly.

Stop after the remediation pass.
```

---

# 18. Release Preparation Prompt

Use only after `0.0.1` is validation-ready.

```text
Prepare Ariadne 0.0.1 for limited public/testing distribution.

Do not add features.

Review:

- package metadata,
- extension name,
- commands,
- README,
- installation instructions,
- privacy explanation,
- limitations,
- screenshots only if already representative,
- LICENSE,
- repository hygiene,
- ignored build/local-data files,
- build/package process.

README messaging must remain:

Ariadne helps developers resume interrupted code Investigations.

Avoid claims such as:

understands your codebase
AI-powered
automatically knows what matters
restores your brain
boosts productivity by X%

Clearly state:

- local-first,
- VS Code only,
- Git context,
- no code upload,
- experimental 0.0.1 status.

Verify a clean installation from the packaged build.

Run the full test/build pipeline.

Do not publish automatically unless explicitly instructed.

Update AGENT_HANDOFF.md with release readiness.
```

---

# 19. Recommended Execution Order

The chain is:

```text
PROMPT 0
Project memory
        ↓
PROMPT 1
Extension scaffold
        ↓
PROMPT 2
Domain + persistence
        ↓
PROMPT 3
Rolling capture
        ↓
PROMPT 4
Git snapshot
        ↓
PROMPT 5
Investigation lifecycle
        ↓
PROMPT 6
Resume Snapshot
        ↓
PROMPT 7
Resume actions
        ↓
PROMPT 8
Privacy + hardening
        ↓
PROMPT 9
0.0.1 quality pass
        ↓
PROMPT 10
Validation-ready build
        ↓
STOP
        ↓
REAL USERS
        ↓
EVIDENCE
        ↓
Post-MVP Decision Prompt
```

The word **STOP** is part of the architecture.

---

# 20. What Not to Tell the Agent Yet

Do not preload coding agents with speculative plans about:

```text
DriftMap
Android
PWA
Windows companion
browser activity tracking
cross-device sync
GitHub integration
GitLab integration
JetBrains
team collaboration
graph visualization
AI
local SLM
semantic code analysis
enterprise version
monetization
```

Those ideas can remain in product-strategy history.

They are irrelevant to implementing Ariadne 0.0.1.

Giving them to a coding agent creates a predictable failure mode:

> "I noticed you'll eventually need cross-platform sync, so I introduced an event-driven abstraction layer..."

No.

---

# 21. The One Paragraph Every Agent Should Understand

If context is ever uncertain, give the agent this:

```text
Ariadne is a local-first VS Code extension whose only current job is to help a developer resume an interrupted code investigation. It observes lightweight factual VS Code activity, enriches it with local Git state, allows an optional human checkpoint, and produces a saved Investigation Snapshot that helps the developer return later. It does not use AI, cloud services, browser tracking, semantic interpretation, productivity scoring, repository-wide graphs, or team functionality. The product should preserve enough context for re-entry, not record everything the developer does.
```

---

# 22. Final Rule

Every coding decision should survive this question:

> **Does this materially help preserve or recover an interrupted code Investigation?**

If the answer is no:

do not build it yet.

And every coding-agent session must end with:

```text
working code
+
verification
+
updated documentation
+
updated AGENT_HANDOFF.md
```

That is how Ariadne can survive not only interrupted developer investigations, but interrupted AI coding-agent conversations as well.
