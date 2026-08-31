# RepoTrail 0.0.1 — Architectural Decision Records

## ADR-001: VS Code Only

**Decision:** RepoTrail 0.0.1 targets VS Code desktop exclusively.

**Reason:** Constraining to a single editor simplifies the event capture layer, storage model, and UI surface. Other editors or browser-based IDEs are deferred until the core product hypothesis is validated.

---

## ADR-002: Local Git Only

**Decision:** RepoTrail interacts only with local Git repositories. No remote operations (fetch, push, pull) are performed.

**Reason:** RepoTrail uses Git state to enrich investigation context, not to manage source control. Read-only local access avoids side effects and keeps the extension safe and predictable.

---

## ADR-003: Local-Only Storage

**Decision:** All RepoTrail data is stored locally on the developer's machine. No cloud storage, sync, or network communication.

**Reason:** Privacy by design. The developer's activity data never leaves their machine. This also eliminates authentication, account management, and network dependency concerns.

---

## ADR-004: No AI in 0.0.1

**Decision:** RepoTrail 0.0.1 does not use AI, LLMs, SLMs, embeddings, or any machine learning.

**Reason:** The core hypothesis is that structured factual context (what files were visited, what was edited, what Git state existed) is sufficient for re-entry. AI interpretation would obscure whether the raw data itself is valuable and would add complexity, cost, and privacy concerns.

---

## ADR-005: No Graph Visualization in 0.0.1

**Decision:** RepoTrail 0.0.1 does not include graph or network visualizations.

**Reason:** Graph rendering adds significant UI complexity (layout algorithms, interaction models, rendering libraries). The first version focuses on validating whether captured context helps re-entry, not on visual presentation. Graph features are a natural future addition once the data model is proven.

---

## ADR-006: No Exhaustive Activity Logging

**Decision:** RepoTrail uses a bounded rolling buffer for observed events, not permanent comprehensive logging.

**Reason:** RepoTrail is a context-recovery tool, not a developer analytics platform. A rolling buffer captures enough recent activity to reconstruct context without creating an ever-growing privacy-sensitive log. This aligns with the principle of storing the minimum necessary for context recovery.

---

## ADR-007: Factual Observations, Not Semantic Interpretation

**Decision:** RepoTrail records factual observations (file opened, file edited, navigation occurred, branch changed) without interpreting developer intent or assigning importance.

**Reason:** Human intent must remain human-supplied. Recording "file visited 6 times" is factual. Labeling it "important file" or "developer was confused" is interpretation that may be wrong and that erodes trust. The Checkpoint mechanism exists for the developer to supply their own context and intent.

---

## ADR-008: Git Enriches Context, Not the Product

**Decision:** Git data (branch, HEAD, modified files, diff stats) is captured as part of Snapshots to provide context, but RepoTrail is not a Git tool.

**Reason:** Many tools already manage Git workflows. RepoTrail's unique value is capturing the broader investigation context around code exploration. Git state is one input to that context, not the primary feature.

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

**Reason:** RepoTrail is meant to preserve only enough recent context to create or enrich an Investigation, not to keep a durable activity log. In-memory retention resets naturally on extension restart, minimizes privacy exposure, and still satisfies the need for recent factual context.

---

## ADR-017: MVP Capture Focuses on Factual Editor, Location, and Edit Signals

**Decision:** The MVP captures only active editor/file transitions, meaningful selection/location changes, edit occurrence, timestamps, workspace path, repository root when identifiable, and minimal metadata such as language id and edit change count.

**Reason:** These signals are factual, low-risk, and directly support later summarization without inferring semantic importance. The product explicitly excludes keystrokes, file contents, clipboard, terminal contents, screenshots, environment variables, and unrelated application activity, so the capture set stays intentionally narrow.

---

## ADR-018: Definition/Reference Navigation Is Deferred Until Reliably Detectable

**Decision:** RepoTrail does not emit `navigation.definition` or `navigation.reference` events in the MVP implementation unless supported VS Code APIs can identify them reliably.

**Reason:** Guessing that a cursor jump or editor switch came from a definition/reference action would invent semantics that the product is designed to avoid. Deferring these events is preferable to recording misleading data that would erode trust in the captured trail.

---

## ADR-019: Git Snapshots Use the Local Git CLI via Safe Argument Lists

**Decision:** RepoTrail captures local Git snapshots by invoking the installed `git` executable directly with fixed argument arrays (`git -C <repoRoot> ...`) after first locating the repository root on disk.

**Reason:** This is the simplest reliable path that stays read-only, works outside the VS Code Git extension host, and is easy to unit-test. Using argv lists instead of shell command strings avoids shell-command injection risks and preserves paths with spaces or special characters.

---

## ADR-020: Git Snapshot Availability Is Explicit and Saved State Is Immutable

**Decision:** `GitSnapshot` records explicit availability states (`available`, `not-repository`, `git-missing`, `git-error`), includes `repositoryRoot`, and allows `head` to be null when a repository has no commits. Persisted snapshots represent Git state at save time only; future resume comparisons must capture a fresh current snapshot separately.

**Reason:** RepoTrail must continue functioning when Git context is missing or incomplete without failing the rest of an Investigation. Making the saved Git state explicit preserves honest THEN context now while leaving room for a later NOW comparison without adding historical Git analytics.
