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
