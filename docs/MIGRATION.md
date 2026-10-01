# Investigation → Thread Migration

The legacy extension stores `Investigation` JSON envelopes under VS Code `globalStorageUri`. The platform Core stores `Thread` state in SQLite.

## Mapping

| Legacy | Platform | Treatment |
|---|---|---|
| `Investigation.id` | `Thread.id` | Preserve where valid |
| `name` | `name` | Preserve and validate bounds |
| `workspace`, `repository` | workspace/repository | Preserve |
| `checkpoint` | Resume Brief context/findings | Import legacy human-authored text without inferring decisions, open questions, or next steps |
| `snapshot` file lists/location | artifacts/events | Convert only factual fields |
| `timeline` | timeline | Preserve event facts; omit unsupported semantics |
| `navigationGraph` | bounded context graph | Convert file nodes/edges with deterministic limits |
| `browserReferences` | external references | Preserve after URL sanitization |
| `git` | optional enrichment | Preserve as factual snapshot data when the target schema supports it |

## Safety requirements

Migration must be import → verify → retain legacy data temporarily. It must be idempotent and non-destructive. A malformed legacy record is skipped with a bounded local log entry; it must not prevent other records from importing. Legacy files are not deleted automatically.

The first Rust slice defines the target objects and storage safety semantics. A production migration command still needs to read the legacy JSON envelope, write a transaction, verify counts and identifiers, and record its migration version.

Legacy Thread payloads without `resume_brief` continue to load. Imported checkpoint text remains visible as context and is replaced by structured data only when a developer explicitly saves a Resume Brief.
