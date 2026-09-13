use ariadne_core::{
    ArtifactKind, CapturePolicy, ContextArtifact, ContextEvent, ContextEventType, ContextGraph,
    ExternalReference, GraphEdge, GraphNode, GraphRelationship, Thread, TimelineEntry,
};
use serde_json::Value;

use crate::{StorageError, Store};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LegacyImportResult {
    pub imported: bool,
    pub already_present: bool,
}

/// Import one legacy JSON envelope without deleting or rewriting the source.
/// The operation is idempotent by legacy Investigation id.
pub fn import_legacy_investigation_json(
    store: &mut Store,
    envelope_json: &str,
    generation: i64,
) -> Result<LegacyImportResult, StorageError> {
    let envelope: Value = serde_json::from_str(envelope_json)?;
    let source = envelope.get("investigation").unwrap_or(&envelope);
    let id = string(source, "id").ok_or_else(|| StorageError::InvalidLegacy("Investigation id is missing".into()))?;
    if store.load_thread(&id)?.is_some() {
        return Ok(LegacyImportResult { imported: false, already_present: true });
    }
    let name = string(source, "name").unwrap_or_else(|| "Imported Thread".into());
    let created_at = string(source, "createdAt").unwrap_or_else(|| "1970-01-01T00:00:00Z".into());
    let saved_at = string(source, "savedAt").unwrap_or_else(|| created_at.clone());
    let mut thread = Thread::new(name, created_at).map_err(|error| StorageError::InvalidLegacy(error.to_string()))?;
    thread.id = id;
    thread.workspace = string(source, "workspace");
    thread.repository = string(source, "repository");
    thread.saved_at = saved_at;
    thread.last_resumed_at = string(source, "lastResumedAt");
    let default_created_at = thread.created_at.clone();
    thread.checkpoint = source.get("checkpoint").and_then(|value| {
        Some(ariadne_core::Checkpoint { text: string(value, "text")?, created_at: string(value, "createdAt").unwrap_or_else(|| default_created_at.clone()) })
    });

    let snapshot = source.get("snapshot").unwrap_or(&Value::Null);
    if let Some(files) = snapshot.get("editedFiles").and_then(Value::as_array) {
        for file in files.iter().filter_map(Value::as_str) { add_artifact(&mut thread, file, 0, 1, &default_created_at); }
    }
    if let Some(counts) = snapshot.get("visitedFileCounts").and_then(Value::as_object) {
        for (file, count) in counts { add_artifact(&mut thread, file, count.as_u64().unwrap_or(0) as u32, 0, &default_created_at); }
    }
    if let Some(references) = source.get("browserReferences").and_then(Value::as_array) {
        let policy = CapturePolicy::default();
        thread.references = references.iter().filter_map(|reference| policy.sanitize_reference(ExternalReference { url: string(reference, "url")?, title: string(reference, "title"), captured_at: string(reference, "capturedAt").unwrap_or_else(|| default_created_at.clone()) })).collect();
    }
    if let Some(graph) = source.get("navigationGraph").and_then(Value::as_object) {
        thread.graph = import_graph(graph, &default_created_at);
    }
    if let Some(timeline) = source.get("timeline").and_then(Value::as_array) {
        for entry in timeline { if let Some(mapped) = import_timeline_entry(entry, &thread) { thread.timeline.push(mapped.0); if let Some(event) = mapped.1 { thread.events.push(event); } } }
    }

    store.save_thread(&thread, None, generation)?;
    Ok(LegacyImportResult { imported: true, already_present: false })
}

fn string(value: &Value, key: &str) -> Option<String> { value.get(key).and_then(Value::as_str).map(str::to_owned).filter(|value| !value.trim().is_empty()) }
fn add_artifact(thread: &mut Thread, reference: &str, visits: u32, edits: u32, timestamp: &str) {
    let id = format!("file:{reference}");
    if let Some(existing) = thread.artifacts.iter_mut().find(|artifact| artifact.id == id) {
        existing.visit_count = existing.visit_count.max(visits);
        existing.edit_count = existing.edit_count.max(edits);
    } else if thread.artifacts.len() < 500 {
        thread.artifacts.push(ContextArtifact { id, kind: ArtifactKind::File, display_name: reference.rsplit(|separator| separator == '/' || separator == '\\').next().unwrap_or(reference).into(), source: "legacy-import".into(), safe_reference: reference.into(), first_observed: timestamp.into(), last_observed: timestamp.into(), visit_count: visits, edit_count: edits });
    }
}

fn import_graph(value: &serde_json::Map<String, Value>, timestamp: &str) -> ContextGraph {
    let nodes = value.get("nodes").and_then(Value::as_array).map(|nodes| nodes.iter().filter_map(|node| { let file = string(node, "filePath")?; Some(GraphNode { artifact_id: format!("file:{file}"), last_observed_at: string(node, "lastObservedAt").unwrap_or_else(|| timestamp.into()) }) }).take(500).collect()).unwrap_or_default();
    let edges = value.get("edges").and_then(Value::as_array).map(|edges| edges.iter().filter_map(|edge| { Some(GraphEdge { from_artifact_id: format!("file:{}", string(edge, "fromFilePath")?), to_artifact_id: format!("file:{}", string(edge, "toFilePath")?), relationship: match string(edge, "relationship").as_deref() { Some("definition") => GraphRelationship::Navigation, Some("reference") => GraphRelationship::ExplicitReference, _ => GraphRelationship::Transition }, count: edge.get("count").and_then(Value::as_u64).unwrap_or(1) as u32, last_observed_at: string(edge, "lastObservedAt").unwrap_or_else(|| timestamp.into()) }) }).take(1_000).collect()).unwrap_or_default();
    ContextGraph { nodes, edges }
}

fn import_timeline_entry(value: &Value, thread: &Thread) -> Option<(TimelineEntry, Option<ContextEvent>)> {
    let timestamp = string(value, "timestamp")?;
    let kind = string(value, "type")?;
    let (event_type, file_path) = match kind.as_str() {
        "file.transition" => (ContextEventType::FileFocused, string(value, "filePath")),
        "file.edit" => (ContextEventType::FileEdited, string(value, "filePath")),
        "resume.point" => (ContextEventType::ThreadResumed, None),
        "save.point" => (ContextEventType::ThreadStopped, None),
        "checkpoint" => (ContextEventType::CheckpointUpdated, None),
        _ => return None,
    };
    let artifact_id = file_path.map(|path| format!("file:{path}"));
    let event = ContextEvent { id: format!("legacy:{timestamp}:{kind}"), timestamp: timestamp.clone(), event_type: event_type.clone(), application: None, artifact: file_path.map(|path| ariadne_core::ArtifactRef { kind: ArtifactKind::File, display_name: path.clone(), reference: path }), workspace: thread.workspace.clone().map(|path| ariadne_core::ArtifactRef { kind: ArtifactKind::Workspace, display_name: path.clone(), reference: path }), location: None, source: "legacy-import".into(), private_browsing: false };
    Some((TimelineEntry { timestamp, event_type, artifact_id, count: value.get("count").and_then(Value::as_u64).unwrap_or(1) as u32 }, Some(event)))
}
