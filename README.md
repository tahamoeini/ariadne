# RepoTrail

> **Pick up a code investigation where you left it.**

## Development

### Prerequisites

- Node.js (LTS)
- VS Code

### Setup

```bash
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Compile in watch mode |
| `npm run lint` | Run ESLint on `src/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run test:unit` | Run unit tests without launching VS Code |
| `npm test` | Run extension tests (downloads VS Code) |
| `npm run package` | Package as `.vsix` |

### Run Locally

1. Open this folder in VS Code.
2. Press **F5** to launch the Extension Development Host.
3. Run **RepoTrail: Start Investigation** or **RepoTrail: Save Recent Activity as Investigation** from the Command Palette.
4. Use **RepoTrail: Add or Update Checkpoint**, **RepoTrail: Save and Stop Investigation**, **RepoTrail: List Saved Investigations**, and **RepoTrail: Delete Investigation** as needed.

### Run Tests

```bash
npm run compile
npm run lint
npm run typecheck
npm run test:unit
```

`npm test` exercises the VS Code extension host and requires downloading VS Code when it is not already cached.

---

RepoTrail is a local-first VS Code companion that preserves the working context around a code investigation so you can return later without reconstructing what you were doing from tabs, Git state, memory, and increasingly desperate guesses.

**VS Code remembers your workspace. Git remembers your changes. RepoTrail remembers the investigation.**

---

# 1. Product Thesis

Modern development tools preserve artifacts extremely well:

* files remain,
* editor tabs remain,
* Git commits remain,
* branches remain,
* diffs remain,
* terminals and workspaces may remain.

What decays much faster is the **human context connecting those artifacts**.

After leaving an investigation for a day or two, a developer often needs to reconstruct:

* What problem was I actually trying to solve?
* Where had I reached?
* Which files did I keep returning to?
* What had I changed?
* What was still unresolved?
* What was my current hypothesis?
* Where should I continue?

RepoTrail exists to reduce that reconstruction cost.

It does **not** attempt to understand the codebase, infer developer intent, score productivity, or create an exhaustive history of developer behavior.

Its purpose is narrower:

> **Preserve enough trustworthy context to make re-entry easier.**

---

# 2. Strategic Positioning

RepoTrail is not:

* a Git client,
* a repository graph,
* a code intelligence platform,
* an AI coding assistant,
* a productivity tracker,
* an employee-monitoring tool,
* an observability product,
* a historical record of everything a developer did.

RepoTrail is an **investigation continuity tool**.

The fundamental object is not a repository, commit, file, or session.

It is an:

# Investigation

An Investigation represents a bounded piece of development work that may be interrupted and resumed later.

Examples:

* Fix refresh-token race
* Investigate flaky payment test
* Understand caching regression
* Debug login redirect
* Trace incorrect state transition
* Explore unfamiliar authentication flow

---

# 3. Core Product Job

The primary job is:

> **Help a developer resume an interrupted code investigation after enough time has passed that their mental context has degraded.**

The key user journey is:

```text
Developer investigates something
        ↓
RepoTrail observes lightweight context
        ↓
Developer stops or gets interrupted
        ↓
Investigation Snapshot is preserved
        ↓
24–72 hours pass
        ↓
Developer opens RepoTrail
        ↓
RepoTrail reconstructs enough context
        ↓
Developer resumes meaningful work
```

The product succeeds if the last step happens materially faster or with fewer reconstruction mistakes than without RepoTrail.

---

# 4. Version 0.0.1

RepoTrail 0.0.1 is deliberately narrow.

## Platform

**VS Code only**

## Data sources

**VS Code activity + local Git**

## Storage

**Local only**

## Core objects

* Investigation
* Rolling Buffer
* Checkpoint
* Snapshot

## Core actions

* Save Investigation
* Save Recent Activity as Investigation
* Add Checkpoint
* Resume Investigation

Optional experimental action:

* Pin File

## Explicitly excluded

RepoTrail 0.0.1 contains no:

* AI
* SLM
* cloud
* account
* authentication
* synchronization
* browser extension
* GitHub integration
* GitLab integration
* JetBrains integration
* terminal-history recording
* collaboration
* team dashboard
* repository graph
* productivity score
* semantic relevance
* automatic code explanation
* cross-device support
* DriftMap functionality

If a feature does not directly help capture or restore investigation context, it does not belong in 0.0.1.

---

# 5. Interaction Model

There are two ways an Investigation can begin.

## A. Explicit capture

The developer knows the work matters.

```text
RepoTrail
→ Save / Start Investigation
→ "Fix refresh-token race"
```

RepoTrail continues observing the investigation.

## B. Retroactive capture

The developer begins what appears to be a tiny task.

Twenty minutes later it is clearly not tiny.

RepoTrail maintains a small rolling local buffer, allowing:

```text
Save Recent Activity
→ Last 20 minutes
→ Create Investigation
```

This is critical because useful interruptions are rarely scheduled in advance.

RepoTrail must not depend on perfect user discipline.

---

# 6. Rolling Buffer

RepoTrail maintains a temporary rolling buffer of approximately the most recent **20 minutes** of lightweight editor activity.

The duration should eventually be configurable, but 20 minutes is sufficient for the initial experiment.

## The buffer may record

```text
timestamp
workspace
repository
active editor/file
previous editor/file
editor transition
edit occurrence
supported definition/reference navigation
branch
lightweight Git working-tree status
meaningful cursor/line positions
```

The buffer exists only to preserve enough recent context to construct an Investigation.

It is **not** intended as a surveillance-grade activity log.

## The buffer must not continuously record

* full file contents
* keystrokes
* clipboard contents
* screenshots
* screen recordings
* terminal contents
* passwords or secrets
* complete diffs after every edit
* arbitrary process activity outside the VS Code workspace

At Investigation-save time, RepoTrail combines buffer evidence with the current Git state to create a durable Snapshot.

---

# 7. Investigation Model

An Investigation should contain approximately:

```text
id
name
workspace
repository

created_at
saved_at
last_resumed_at

checkpoint

observed_activity
edited_files
visited_files
pinned_files

git_snapshot

last_location
```

The schema should remain intentionally small.

Do not design a generalized Trail Protocol yet.

Real usage should determine what the schema actually needs.

---

# 8. Checkpoint

A Checkpoint is a short human-authored note preserving the part RepoTrail cannot observe:

**thought.**

Example:

```text
Race probably happens when delayed refresh retry
arrives after invalidateSession().

Next:
write a test that delays the response.
```

RepoTrail must treat human-supplied context differently from observed activity.

Observed evidence can tell us:

```text
tokenService.ts was visited six times
```

It cannot honestly tell us:

```text
tokenService.ts was the most important file.
```

Similarly, Git can tell us:

```text
commit abc123 changed this file
```

It cannot reliably tell us:

```text
this is why the current architecture exists.
```

RepoTrail must preserve that distinction throughout the product.

---

# 9. Manual Interaction Hierarchy

Manual actions impose friction and should therefore be ranked.

## Essential

### Save Investigation

Preserve the current investigation.

### Resume Investigation

Return to a preserved investigation.

## Valuable

### Checkpoint

Optionally preserve current hypothesis, unresolved question, or next step.

## Experimental

### Pin File

Allow the developer to explicitly mark a file as belonging to the investigation.

Pinning may be useful, but RepoTrail must work when the user never pins anything.

If early users consistently ignore the action, remove it.

The product should not become a curation ritual.

---

# 10. Investigation Snapshot

The Snapshot is the primary artifact of RepoTrail.

The first version should prioritize useful re-entry information rather than visualization.

Example:

```text
FIX REFRESH-TOKEN RACE
────────────────────────────────

Saved
Friday 17:43

Checkpoint
Race may happen when a delayed refresh retry
arrives after session invalidation.

Need to reproduce it with a delayed response.

Workspace
payments-api

Branch when saved
fix/token-race

Git state when saved
3 modified
1 untracked
+42 / -17

Current Git state
5 modified
1 untracked

Edited files
tokenService.ts
auth.test.ts
tokenRepository.ts

Revisited files
tokenService.ts      6 visits
auth.test.ts         4 visits
repository.ts        3 visits

Pinned files
auth.test.ts

Last location
tokenService.ts:183

Recent observed path
authController.ts
→ tokenService.ts
→ tokenRepository.ts
→ auth.test.ts
→ tokenService.ts

[ Resume Investigation ]
```

RepoTrail should expose **observable evidence**, not synthetic judgments.

Good:

```text
Visited 6 times
Edited
Pinned
Opened through definition navigation
```

Bad:

```text
Important
Relevant
High-value
Core file
87% investigation relevance
```

---

# 11. Git Snapshot

RepoTrail must distinguish two states:

```text
THEN
Repository state when Investigation was saved

NOW
Repository state when Investigation is resumed
```

This matters because work may continue independently after the Investigation is saved.

## Version 0.0.1 Git Snapshot

Persist:

```text
HEAD commit
branch
modified file list
untracked file list
diff statistics
timestamp
```

Potentially:

```text
file-level last commit
```

if implementation remains cheap.

Do not initially persist complete Git history analytics.

On Resume, RepoTrail can compare:

```text
When saved
3 modified files

Now
5 modified files

Additional changes
auth.test.ts
package.json
```

This can help distinguish yesterday's investigation from subsequent repository changes.

---

# 12. Git's Role

Git is **context enrichment**.

It is not the product.

Version 0.0.1 may use Git for:

* current branch
* HEAD
* working-tree state
* modified files
* untracked files
* diff statistics
* potentially last commit for relevant files

Future possibilities include:

* file history
* co-change evidence
* code age
* authorship
* churn
* hotspots

But these must not be treated as inherently meaningful.

Example:

Good:

> `auth.ts` and `auth.test.ts` appeared together in 19 commits.

Bad:

> `auth.ts` and `auth.test.ts` are strongly architecturally coupled.

The second statement is an inference that raw Git history does not guarantee.

---

# 13. Activity Evidence

RepoTrail may observe several types of evidence.

Examples:

```text
File opened
File revisited
File edited
Definition navigation
Reference navigation
Cursor location
Workspace change
Branch change
```

The product may use heuristics internally to reduce noise, but the heuristics must remain transparent.

Example:

A file opened for 0.7 seconds and immediately closed may be hidden from the default Resume Snapshot.

But RepoTrail should not conclude:

> irrelevant file.

It can simply treat it as a low-signal event.

Likewise:

```text
6 visits
```

must remain:

```text
6 visits
```

rather than being transformed into:

```text
high importance
```

---

# 14. Noise Handling

Passive tracking will generate noise.

Version 0.0.1 should optimize for **useful signal**, not perfect historical fidelity.

Possible rules:

```text
Very short open with no interaction
→ hide from default summary

Edited
→ show explicitly

Revisited
→ show visit count

Definition/reference navigation
→ preserve relationship

Last active file
→ preserve location

Pinned
→ always show
```

These rules are presentation heuristics.

The raw underlying evidence may still be retained within the Investigation where reasonable.

RepoTrail is not trying to answer:

> What exactly did the developer do every second?

It is trying to answer:

> What information will help this developer resume tomorrow?

---

# 15. Resume Behavior

RepoTrail should distinguish three concepts.

## Remember

Display previously observed state.

## Reopen

Open resources where VS Code reliably supports it.

Examples may include:

* workspace
* relevant files
* last file
* approximate cursor location

## Restore

Use this word only for state RepoTrail can actually recreate reliably.

RepoTrail must not promise restoration of a developer's mental state.

The product promise is:

> **Give the developer enough preserved investigation context to continue.**

---

# 16. Resume UX Priority

The Resume screen should answer, in roughly this order:

### What was I trying to do?

Investigation name.

### What did I explicitly think?

Checkpoint.

### Where was I working?

Workspace, branch, last location.

### What had changed?

Saved Git state and current Git state.

### What files did I actually interact with?

Edited files, visit counts, pinned files.

### How had the investigation recently moved?

Short observed path.

Raw telemetry should never overwhelm these questions merely because it is technically available.

---

# 17. No Graph in 0.0.1

RepoTrail originally emerged from ideas involving timelines and navigation graphs.

The graph is deliberately removed from the first validation build.

Reason:

> A visually impressive graph can make weak telemetry appear useful.

Version 0.0.1 must prove that preserved context itself has value.

If developers benefit from the Resume Snapshot without visualization, the core hypothesis becomes much stronger.

A graph or timeline may later become useful for answering:

> How did I move through this investigation?

But visualization must earn its place through evidence.

---

# 18. Privacy Principles

RepoTrail should be local-first by architecture, not marketing.

Version 0.0.1:

```text
No account
No cloud
No telemetry
No external API
No AI provider
No code upload
No repository upload
```

RepoTrail stores only what it needs for local investigation continuity.

Users should be able to:

* inspect stored Investigations,
* delete an Investigation,
* delete all RepoTrail data,
* configure retention later,
* disable the extension,
* export their own data later if useful.

The product should never gradually mutate into employee monitoring.

---

# 19. Security Principles

RepoTrail handles potentially sensitive development metadata.

Therefore:

* minimize stored data,
* avoid storing full source contents unnecessarily,
* avoid collecting secrets,
* avoid recording terminal output by default,
* avoid recording environment variables,
* keep repository information local,
* use predictable local storage locations,
* make deletion straightforward,
* treat file paths and branch names as potentially sensitive.

Security complexity should remain proportional to the narrow local-first architecture.

---

# 20. Product Non-Goals

These are intentionally explicit because interesting products are often killed by plausible adjacent features.

RepoTrail is not currently trying to:

### Understand repositories

It records investigation context.

### Explain code

Developers already have other tools for that.

### Replace GitLens or GitKraken

Git context supports RepoTrail.

### Replace Sourcegraph

RepoTrail is not code intelligence infrastructure.

### Track developer productivity

No productivity scores.

### Measure developer performance

Absolutely not.

### Capture everything

Useful re-entry signal matters more than exhaustive fidelity.

### Become DriftMap

General digital context is a future thesis, not a current scope item.

---

# 21. Validation Strategy

RepoTrail should be treated as an experiment before being treated as a startup.

Three hypotheses must be tested independently.

---

# H1. Re-entry Utility

### Hypothesis

RepoTrail reduces the cost of resuming an interrupted code investigation after approximately 24–72 hours.

### Measures

#### Time to orientation

Time until the developer can accurately state:

```text
What was I trying to do?
Where had I reached?
What remained unresolved?
Where should I continue?
```

#### Time to first meaningful continuation

Time until the developer performs a relevant continuation action such as:

```text
edit relevant code
run relevant test
inspect relevant file
continue debugging
```

#### Reconstruction mistakes

Examples:

* repeating already completed investigation,
* reopening irrelevant files,
* forgetting previously established findings,
* incorrectly reconstructing Git state,
* missing unresolved work.

#### Repeated work

Measure whether developers unnecessarily redo actions they had already completed.

---

# H2. Capture Sufficiency

### Hypothesis

VS Code activity + Git state + optional human checkpoint preserve enough context to materially support re-entry.

This hypothesis asks:

> Does RepoTrail's passive context actually add value?

The answer may be no.

That result must be accepted.

---

# H3. Natural Product Behavior

### Hypothesis

Developers voluntarily save and resume Investigations without being prompted by a controlled study.

Observe:

```text
Investigations created voluntarily
Investigations resumed
Time between save and resume
Repeated use
Abandoned investigations
Checkpoint usage
Retroactive capture usage
```

A controlled experiment may validate H1 while H3 fails.

That would indicate a useful technique but potentially a weak standalone product.

---

# 22. Ablation Experiment

This is one of the most important early experiments.

Compare re-entry using:

| Variant | Available context                            |
| ------- | -------------------------------------------- |
| **A**   | Checkpoint only                              |
| **B**   | Checkpoint + Git state                       |
| **C**   | Checkpoint + Git state + observed file trail |
| **D**   | Git state + observed trail, no checkpoint    |
| **E**   | Existing VS Code + Git only                  |

The purpose is to identify RepoTrail's actual incremental contribution.

## Possible interpretations

### C significantly beats B

Passive investigation history adds real value.

This strongly supports RepoTrail.

### B approximately equals C

Observed navigation contributes little.

Simplify the product.

### D performs surprisingly well

RepoTrail can support unexpected interruption without requiring checkpoint discipline.

Very encouraging.

### A or B strongly beats E, but C adds little

The valuable product may be a simpler investigation-checkpoint system rather than a passive trail engine.

Accept that result.

### Nothing materially beats E

Stop.

Do not rescue the concept by immediately adding:

* graphs,
* browser tracking,
* AI,
* GitHub,
* team features.

The hypothesis failed.

That information is valuable.

---

# 23. Initial User Testing

Start with developers who regularly:

* debug multi-file issues,
* switch between projects,
* leave unfinished work overnight,
* return to interrupted feature work,
* maintain side projects intermittently,
* work inside unfamiliar repositories.

The initial sample does not need to be huge.

The objective is learning, not statistical theater.

A small number of repeated observations across real investigations will expose major product problems quickly.

Dogfooding is useful but insufficient.

The product creator knows how RepoTrail works and will unconsciously adapt behavior around it.

External developers matter.

---

# 24. Primary Success Criterion

The strongest qualitative signal is not:

> Cool extension.

or:

> Nice timeline.

or:

> I like the idea.

It is:

> **I came back to this task and RepoTrail saved me from figuring out what I had been doing again.**

The behavioral equivalent is:

```text
Save
↓
leave
↓
return
↓
Resume
↓
meaningful continuation
```

Repeated naturally.

That is the product.

---

# 25. Failure Criteria

RepoTrail should be reconsidered or killed if:

* developers rarely reopen Investigations,
* checkpoint + VS Code restore performs just as well,
* passive navigation data adds little or no re-entry value,
* users find the capture model distracting,
* developers cannot understand the Snapshot quickly,
* the Snapshot mostly duplicates Git/VS Code information,
* manual actions are required so frequently that capturing context becomes work itself.

A failed hypothesis should not automatically produce a larger roadmap.

---

# 26. Roadmap Philosophy

There is only one committed release:

# 0.0.1

Everything after that is evidence-driven.

Do not pre-commit to:

```text
Timeline
→ Graph
→ Browser
→ GitHub
→ Collaboration
→ DriftMap
```

Instead:

```text
0.0.1
  ↓
Observe re-entry failures
  ↓
Identify next bottleneck
  ↓
Build smallest intervention
  ↓
Test again
```

Possible future features are hypotheses, not promises.

---

# 27. Potential Future Directions

These remain intentionally unfrozen.

## Timeline / Trail

Potentially useful if developers need to reconstruct:

> How did I move through this investigation?

Example:

```text
controller
→ service
→ repository
→ test
→ service
```

## Navigation Graph

Potentially useful if relationships among investigation artifacts are difficult to reconstruct from a linear list.

It must remain investigation-scoped.

Never render the entire repository merely because graphs are pretty.

## Web References

Potentially useful if developers repeatedly lose external documentation, issues, RFCs, Stack Overflow answers, package docs, etc.

Likely interaction:

```text
Attach current page to Investigation
```

or:

```text
Candidate references

OAuth docs          [Attach]
GitHub issue #381   [Attach]
Stack Overflow      [Ignore]
```

Automatic browser-history dumping should be avoided.

## Richer Git Context

Potentially:

* file history
* relevant commits
* co-change evidence
* age
* churn

Always show evidence before interpretation.

## Terminal/Test Context

Potentially useful if re-entry frequently depends on:

* last test run,
* failing test,
* command executed,
* debugger state.

Should only be implemented when evidence shows the benefit exceeds the privacy/noise cost.

## Handoff

A particularly interesting future direction.

An Investigation could become a portable artifact:

```text
bug-482.repotrail
```

Another developer receives:

```text
task
checkpoint
Git state
edited files
observed trail
references
```

This expands the job from:

> Help me resume my investigation.

to:

> Help another developer inherit my investigation.

Do not build collaboration infrastructure initially.

---

# 28. RepoTrail and DriftMap

RepoTrail and DriftMap should no longer be treated as parallel products.

The broader thesis is:

> **Digital systems preserve artifacts better than they preserve human context across those artifacts.**

RepoTrail is the narrow wedge:

```text
Developer
+
VS Code
+
Git
+
Interrupted investigation
```

It provides a controlled environment for learning:

* which events matter,
* whether passive capture helps,
* how much manual annotation users tolerate,
* what Resume actually needs,
* whether trails matter,
* whether timelines matter,
* whether graphs matter,
* how context boundaries behave,
* how long preserved context remains useful.

Only if RepoTrail demonstrates the value of context continuity should DriftMap be reconsidered as a generalization.

Strategically:

```text
Context Continuity Thesis
          │
          ▼
      RepoTrail
   developer wedge
          │
       evidence
          │
          ▼
Possible generalization
          │
          ▼
       DriftMap
```

DriftMap is not Roadmap Item #12.

It is a future hypothesis.

---

# 29. Suggested Technical Shape

Keep the implementation conventional.

A VS Code extension should handle:

```text
event capture
rolling buffer
Investigation lifecycle
Snapshot UI
resume actions
```

A small local persistence layer stores Investigations.

Git integration can initially rely on the local repository rather than external services.

Conceptually:

```text
VS Code Events
      │
      ▼
Event Normalizer
      │
      ▼
Rolling Buffer
      │
      ├─────────────┐
      │             │
      ▼             ▼
Investigation     Local Git
      │             │
      └──────┬──────┘
             ▼
          Snapshot
             │
             ▼
           Resume
```

Avoid premature service boundaries.

A local VS Code extension does not need a microservices architecture merely because diagrams look more architectural when they contain boxes.

---

# 30. Possible Internal Event Model

Keep events factual.

Example:

```json
{
  "timestamp": "2026-08-31T14:42:11Z",
  "type": "editor.activated",
  "workspace": "payments-api",
  "path": "src/auth/tokenService.ts"
}
```

Other event categories might include:

```text
editor.activated
document.edited
navigation.definition
navigation.reference
workspace.changed
branch.changed
git.status_observed
checkpoint.created
investigation.saved
investigation.resumed
```

Do not encode things such as:

```text
file.important
developer.confused
context.relevant
```

unless a human explicitly supplies that meaning.

---

# 31. Investigation Lifecycle

A simple state model is enough:

```text
ROLLING
   │
   ├── Save Recent
   │
   ▼
ACTIVE INVESTIGATION
   │
   ├── Checkpoint
   ├── Update context
   │
   ▼
SAVED
   │
   ├── Resume
   │
   ▼
ACTIVE
```

An Investigation may later be:

```text
completed
archived
deleted
```

but that is secondary.

Avoid workflow complexity until real usage demands it.

---

# 32. UX Principles

RepoTrail should feel quiet.

It should not behave like another tool demanding constant maintenance.

Principles:

### Passive by default

Capture enough without requiring continuous interaction.

### Human meaning is optional

Checkpoint when useful.

### No judgment

Show evidence.

### Fast re-entry

The Resume Snapshot should be understandable within seconds.

### Local trust

Make storage and behavior predictable.

### Minimal interruption

RepoTrail should not become another reason the developer loses context.

A context-recovery product interrupting developers constantly would be an impressively self-defeating achievement.

---

# 33. Internal Decision Rules

When considering any new feature, ask:

### 1. Does this help capture context?

If no, probably reject.

### 2. Does this help understand preserved context?

If no, probably reject.

### 3. Does this help resume an investigation?

If no, probably reject.

### 4. Does existing VS Code/Git functionality already solve it sufficiently?

If yes, reject unless RepoTrail adds investigation-specific value.

### 5. Does it add another data source or permission?

If yes, demand stronger evidence.

### 6. Does it turn observation into interpretation?

If yes, expose the underlying evidence instead.

### 7. Can we validate the same hypothesis with something smaller?

If yes, build the smaller thing.

---

# 34. Development Milestones

These are implementation milestones inside 0.0.1, not future product releases.

## Milestone A: Event Capture

Prove that the extension can locally record:

* workspace
* active-file transitions
* edit occurrence
* last location
* basic Git state

Deliverable:

A developer can inspect a raw local session and verify that the events are accurate enough.

---

## Milestone B: Rolling Buffer

Maintain a bounded recent activity window.

Deliverable:

```text
Save last 20 minutes
```

creates a durable Investigation.

---

## Milestone C: Investigation

Implement:

* Investigation name
* creation
* checkpoint
* saved timestamps
* local persistence

Deliverable:

A spontaneous investigation can be preserved.

---

## Milestone D: Git Snapshot

Save:

* HEAD
* branch
* modified files
* untracked files
* diff statistics

Deliverable:

RepoTrail can distinguish saved Git state from current state.

---

## Milestone E: Resume Snapshot

Create the first real product surface.

Deliverable:

A developer can reopen an Investigation and immediately see:

```text
task
checkpoint
saved/current Git state
edited files
visit counts
last location
recent observed path
```

---

## Milestone F: Resume Actions

Where supported:

* open workspace
* reopen relevant files
* return to last file/location

Deliverable:

RepoTrail assists continuation rather than merely describing history.

---

## Milestone G: Validation Build

Package the extension for a small external test group.

No additional features.

The next milestone is **learning**, not another build.

---

# 35. Validation Exit Gate

Do not expand RepoTrail until there is evidence that:

### H1

Re-entry improves.

### H2

RepoTrail's captured context contributes beyond ordinary VS Code/Git restore.

### H3

At least some developers voluntarily save and later resume Investigations.

If those are weak, change or kill the product before expanding it.

If they are strong, identify the largest remaining re-entry bottleneck and build the smallest feature that addresses it.

---

# 36. Product Strategy in One Page

## Problem

Developers returning to interrupted investigations must reconstruct mental context from scattered artifacts.

## User

Developer working on multi-file debugging, maintenance, or implementation tasks.

## Job

Resume an investigation later without rebuilding context from scratch.

## Product

A local VS Code extension that preserves lightweight investigation context using editor activity, Git state, and optional human checkpoints.

## Differentiation Hypothesis

Existing tools preserve:

```text
workspace
code
Git history
```

RepoTrail preserves:

```text
the investigation connecting them
```

## MVP

```text
VS Code
+
local Git
+
rolling 20-minute buffer
+
Investigation
+
Checkpoint
+
Snapshot
+
Resume
```

## Non-goals

```text
AI
cloud
browser
graph
productivity analytics
repository intelligence
team collaboration
```

## Core Test

> After 24–72 hours away, does RepoTrail help developers meaningfully resume work faster or with fewer reconstruction mistakes?

## Kill Condition

If the passive context adds no meaningful benefit beyond existing VS Code/Git state and a basic checkpoint, do not rescue the concept by adding features.

---

# 37. Final Principle

RepoTrail should remain disciplined around one idea:

> **The goal is not to remember everything the developer did. The goal is to preserve enough context that they do not have to reconstruct the investigation later.**

Everything else is optional.

And until evidence says otherwise, RepoTrail 0.0.1 is not the first tiny version of a giant platform.

It is an experiment designed to answer one uncomfortable but valuable question:

> **Is the missing investigation context between VS Code and Git useful enough that developers will actually want software to preserve it?**

If yes, build from evidence.

If no, stop.

That is the roadmap.
