# Ariadne 0.0.1 — Architectural Decision Records

## ADR-001: VS Code Only

**Decision:** Ariadne 0.0.1 targets VS Code desktop exclusively.

**Reason:** Constraining to a single editor simplifies the event capture layer, storage model, and UI surface. Other editors or browser-based IDEs are deferred until the core product hypothesis is validated.

---

## ADR-002: Local Git Only

**Decision:** Ariadne interacts only with local Git repositories. No remote operations (fetch, push, pull) are performed.

**Reason:** Ariadne uses Git state to enrich investigation context, not to manage source control. Read-only local access avoids side effects and keeps the extension safe and predictable.

---

## ADR-003: Local-Only Storage

**Decision:** All Ariadne data is stored locally on the developer's machine. No cloud storage, sync, or network communication.

**Reason:** Privacy by design. The developer's activity data never leaves their machine. This also eliminates authentication, account management, and network dependency concerns.

---

## ADR-004: No AI in 0.0.1

**Decision:** Ariadne 0.0.1 does not use AI, LLMs, SLMs, embeddings, or any machine learning.

**Reason:** The core hypothesis is that structured factual context (what files were visited, what was edited, what Git state existed) is sufficient for re-entry. AI interpretation would obscure whether the raw data itself is valuable and would add complexity, cost, and privacy concerns.

---

## ADR-005: No Graph Visualization or Repository-Wide Dependency Graph in 0.0.1

**Decision:** Ariadne 0.0.1 does not include graph or network visualizations, and it does not build a repository-wide dependency graph.

**Reason:** Graph rendering adds significant UI complexity (layout algorithms, interaction models, rendering libraries), while repository-wide dependency inference would answer a different question than the product is trying to solve. Ariadne focuses on re-entry into one Investigation, not on explaining repository architecture.

---

## ADR-006: No Exhaustive Activity Logging

**Decision:** Ariadne uses a bounded rolling buffer for observed events, not permanent comprehensive logging.

**Reason:** Ariadne is a context-recovery tool, not a developer analytics platform. A rolling buffer captures enough recent activity to reconstruct context without creating an ever-growing privacy-sensitive log. This aligns with the principle of storing the minimum necessary for context recovery.

---

## ADR-007: Factual Observations, Not Semantic Interpretation

**Decision:** Ariadne records factual observations (file opened, file edited, navigation occurred, branch changed) without interpreting developer intent or assigning importance.

**Reason:** Human intent must remain human-supplied. Recording "file visited 6 times" is factual. Labeling it "important file" or "developer was confused" is interpretation that may be wrong and that erodes trust. The Checkpoint mechanism exists for the developer to supply their own context and intent.

---

## ADR-008: Git Enriches Context, Not the Product

**Decision:** Git data (branch, HEAD, modified files, diff stats) is captured as part of Snapshots to provide context, but Ariadne is not a Git tool.

**Reason:** Many tools already manage Git workflows. Ariadne's unique value is capturing the broader investigation context around code exploration. Git state is one input to that context, not the primary feature.

---

## ADR-009: TypeScript with ESLint Flat Config

**Decision:** The extension uses TypeScript 5.x compiled to CommonJS (`ES2022` target). Linting uses ESLint 9 with the flat config format (`eslint.config.mjs`) and `@typescript-eslint`.

**Reason:** TypeScript is required by VS Code extension conventions. ESLint flat config is the current recommended format (legacy `.eslintrc` is deprecated). Minimal rule set to avoid unnecessary noise.

---

## ADR-010: @vscode/test-cli for Testing

**Decision:** Extension tests use `@vscode/test-cli` with `@vscode/test-electron`, configured via `.vscode-test.mjs`.

**Reason:** This is the officially recommended VS Code extension testing approach as of 2025. It downloads VS Code automatically and runs Mocha-based integration tests inside an Extension Development Host.

---

## ADR-011: VS Code Engine ^1.100.0

**Decision:** The extension targets VS Code `^1.100.0` as the minimum engine version.

**Reason:** Targets a recent-enough baseline to use current APIs without requiring bleeding-edge versions. Aligns with the stable release timeline.

---

## ADR-012: JSON File Storage via globalStorageUri

**Decision:** Investigations are persisted as individual JSON files in `ExtensionContext.globalStorageUri.fsPath/investigations/`. Each file contains a versioned envelope (`{ schemaVersion, investigation }`).

**Reason:** JSON files are human-inspectable, survive extension restarts, require no external database, and avoid the 1 MB size limit of `globalState`. One file per investigation keeps reads/writes simple and avoids lock contention. The envelope's `schemaVersion` field enables future migrations without data loss.

---

## ADR-013: Schema Version Envelope

**Decision:** Every persisted JSON file wraps the data in `{ schemaVersion: number, investigation: {...} }`. Unknown schema versions are rejected on load (return null).

**Reason:** Enables forward-compatible storage. When the domain model changes, a migration function can transform old envelopes to the current schema. Rejecting unknown future versions prevents data corruption from downgraded extensions.

---

## ADR-014: Plain Interfaces, No Classes

**Decision:** Domain types are TypeScript interfaces. Factory functions (`createInvestigation`, `createCheckpoint`, `createEmptySnapshot`) produce plain objects.

**Reason:** Plain objects serialize to JSON without custom `toJSON`/`fromJSON` methods. No prototype chains, no `instanceof` checks, no class hierarchy to maintain. Keeps the domain layer simple and testable.

---

## ADR-015: Mocha Unit Tests Alongside VS Code Integration Tests

**Decision:** Pure domain and storage tests run via `npm run test:unit` using Mocha directly (no VS Code host). Integration tests that require VS Code APIs run via `npm test` (`@vscode/test-cli`).

**Reason:** Domain and storage logic has no VS Code dependency. Running these tests without downloading VS Code is faster, works in CI without display servers, and provides quicker feedback during development.

---

## ADR-016: In-Memory 20-Minute Rolling Buffer

**Decision:** Observed events are retained only in memory, per workspace, for a default 20-minute window. The retention window is internally configurable, and a safety max-event cap prevents unbounded growth during unusually noisy sessions.

**Reason:** Ariadne is meant to preserve only enough recent context to create or enrich an Investigation, not to keep a durable activity log. In-memory retention resets naturally on extension restart, minimizes privacy exposure, and still satisfies the need for recent factual context.

---

## ADR-017: MVP Capture Focuses on Factual Editor, Location, and Edit Signals

**Decision:** The MVP captures only active editor/file transitions, selection/location changes, edit occurrence, timestamps, workspace path, repository root when identifiable, and minimal metadata such as language id and edit change count.

**Reason:** These signals are factual, low-risk, and directly support later summarization without inferring semantic importance. The product explicitly excludes keystrokes, file contents, clipboard, terminal contents, screenshots, environment variables, and unrelated application activity, so the capture set stays intentionally narrow.

---

## ADR-018: Definition/Reference Navigation Is Deferred Until Reliably Detectable

**Decision:** Ariadne does not emit `navigation.definition` or `navigation.reference` events in the MVP implementation unless supported VS Code APIs can identify them reliably.

**Reason:** Guessing that a cursor jump or editor switch came from a definition/reference action would invent semantics that the product is designed to avoid. Deferring these events is preferable to recording misleading data that would erode trust in the captured trail.

---

## ADR-019: Git Snapshots Use the Local Git CLI via Safe Argument Lists

**Decision:** Ariadne captures local Git snapshots by invoking the installed `git` executable directly with fixed argument arrays (`git -C <repoRoot> ...`) after first locating the repository root on disk.

**Reason:** This is the simplest reliable path that stays read-only, works outside the VS Code Git extension host, and is easy to unit-test. Using argv lists instead of shell command strings avoids shell-command injection risks and preserves paths with spaces or special characters.

---

## ADR-020: Git Snapshot Availability Is Explicit and Saved State Is Immutable

**Decision:** `GitSnapshot` records explicit availability states (`available`, `not-repository`, `git-missing`, `git-error`), includes `repositoryRoot`, and allows `head` to be null when a repository has no commits. Persisted snapshots represent Git state at save time only; future resume comparisons must capture a fresh current snapshot separately.

**Reason:** Ariadne must continue functioning when Git context is missing or incomplete without failing the rest of an Investigation. Making the saved Git state explicit preserves honest THEN context now while leaving room for a later NOW comparison without adding historical Git analytics.

---

## ADR-021: One Active Investigation Per Workspace

**Decision:** Ariadne keeps at most one active Investigation per workspace and stores only the active Investigation id in `workspaceState` for restart recovery.

**Reason:** The lifecycle milestone needs a concrete active Investigation concept for checkpoint and save/stop flows, but the product explicitly avoids complicated workflow states. One active Investigation per workspace keeps the model simple, matches the per-workspace rolling buffer, and is enough to preserve context without introducing queues, tabs, or scheduling logic.

---

## ADR-022: Pin File Is Deferred Until Passive Evidence Proves Insufficient

**Decision:** The optional Pin File action remains out of the current model and UI for the lifecycle milestone.

**Reason:** Ariadne 0.0.1 is supposed to work when the developer performs almost no manual curation. The current lifecycle already persists investigation name, optional checkpoint, rolling-buffer events, Git state, last location, edited files, and factual visit counts; adding pin management now would add disproportionate UI and state complexity before there is evidence that passive capture is insufficient.

---

## ADR-023: Resume Snapshot Uses a Read-Only VS Code Virtual Document

**Decision:** The first Resume Snapshot surface is implemented as a read-only virtual Markdown document opened from the Command Palette or saved-Investigation picker.

**Reason:** Ariadne 0.0.1 needs a fast, trustworthy re-entry surface, not a polished custom UI. A VS Code-native virtual document keeps the implementation lightweight while still letting the product show structured factual context, current Git comparisons, and honest empty/missing states without introducing webview complexity prematurely.

---

## ADR-024: Resume Uses Conservative Reopen, Not Restore

**Decision:** Ariadne 0.0.1 resume actions open the factual Resume Snapshot and then reopen at most five saved files, prioritizing the saved anchor file, graph-adjacent Investigation artifacts, edited files, and factual revisit counts. Missing files and workspace drift are reported as partial recovery instead of triggering exact restore attempts.

**Reason:** VS Code can reliably reopen existing files and reveal saved positions, but it cannot truthfully promise full restoration of a prior tab set, window layout, workspace session, or a developer's mental state. Keeping reopen behavior small and factual makes Resume helpful without turning it into noisy tab explosion, and using Investigation-local navigation relationships keeps the reopen order relevant without inferring repository architecture.

---

## ADR-025: Persist Only Re-Entry-Critical Investigation Data

**Decision:** Schema version 3 and later persist only the subset of Investigation data required for re-entry: investigation identity, workspace context, optional checkpoint text, workspace-relative reopen evidence, a short recent path, saved Git drift metadata, and any later Investigation-scoped sequence or graph data that directly improves Resume. Ariadne does not persist `createdAt`, `lastResumedAt`, `checkpoint.createdAt`, full observed-event objects, or per-event source metadata.

**Reason:** Every persisted field must justify itself against the question "Is this required for re-entry?" Removed fields added sensitive local metadata without materially improving reopen behavior, while the retained fields directly support remembering, reopening, or honestly showing repository drift.

---

## ADR-026: Use the Actual Local Security Model, Not Cosmetic Encryption

**Decision:** Ariadne keeps saved Investigations as local JSON under `globalStorageUri`, applies best-effort private filesystem permissions where supported, writes through temp-file replacement while retaining the previous saved version as a `.bak` recovery copy, and exposes user commands to reveal or delete all local data. Ariadne does not add custom encryption or move general Investigation metadata into secret storage.

**Reason:** Ariadne's threat model is local developer metadata on the same machine, not remote secret distribution. VS Code secret storage is appropriate for credentials, but Ariadne intentionally does not collect credentials; pretending otherwise with ad-hoc encryption would add complexity without providing a trustworthy security boundary.

---

## ADR-027: Activate on Startup So Retroactive Capture Works

**Decision:** Ariadne declares `onStartupFinished` so the extension activates before the first explicit Ariadne command.

**Reason:** The rolling buffer must already exist when a developer chooses `Save Recent Activity as Investigation`. Command-only activation makes retroactive capture impossible because the buffer would be created only after the user asked to save it.

---

## ADR-028: Persist Active Investigations on Shutdown

**Decision:** Ariadne persists the current state of every active Investigation during extension deactivation.

**Reason:** Active investigations continue to accumulate edited-file, last-location, and Git-drift evidence after they are first created. Normal window close, reload, or extension restart should not throw away that in-memory progress when the product promise is to reopen the same investigation later.

---

## ADR-029: Reuse One Resume Snapshot Document per Investigation

**Decision:** Resume Snapshot virtual documents use a stable per-investigation URI and refresh their content in place when the saved Investigation changes.

**Reason:** Save/checkpoint flows can update the same Investigation multiple times. A stable URI avoids duplicate Resume Snapshot tabs and ensures repeated opens show the latest saved data and current Git comparison instead of stale cached content.

---

## ADR-030: Add a Condensed Investigation-Scoped Timeline Before Any Graph

**Decision:** Ariadne 0.0.1 persists and renders a small factual timeline inside each Investigation before considering any graph visualization.

**Reason:** Validation evidence indicated that developers needed better reconstruction of sequence during re-entry. The smallest trustworthy response is a condensed timeline bounded to one Investigation and rendered in the existing Resume Snapshot. This preserves factual ordering of file transitions, edit events, checkpoint changes, Git snapshots, and save/resume points without creating a dashboard, inferring meaning, or introducing graph complexity before the timeline itself is validated.

---

## ADR-031: Add an Investigation-Scoped Navigation Graph for Resume

**Decision:** Ariadne persists a small Investigation-scoped navigation graph whose nodes are observed Investigation artifacts and whose edges are factual observed transitions or supported navigation relationships. The graph is rendered textually inside the Resume Snapshot and is used to prioritize reopen candidates during Resume.

**Reason:** Validation evidence showed that sequence alone was not always enough; developers also needed a spatial representation of how they moved through one Investigation. The implemented graph stays narrow by collapsing noise, avoiding architectural inference, staying bounded to one Investigation, and directly improving Resume instead of becoming a decorative analytics feature.

---

## ADR-032: Deliberate Minimal Browser References Only

**Decision:** Ariadne may retain a small list of browser references only when the developer explicitly attaches them to the active Investigation. Ariadne may offer the current open page or a temporary list of open-page candidates from VS Code tabs, but it must not automatically import browser history or page content.

**Reason:** Validation evidence indicated that external web references were a recurring re-entry gap, but broad browser capture would push Ariadne toward a different product. Explicit attachment captures only what the developer decides matters, keeps the saved shape minimal, avoids background history ingestion, preserves the local-only privacy boundary, and keeps the feature tied to Investigation re-entry rather than general browsing analytics.
