use crate::{
    bounded_text, build_resume_plan, CapturePolicy, Checkpoint, ContextArtifact, ContextEvent,
    ContextEventType, ContextGraph, DomainError, ExternalReference, GraphEdge, GraphNode,
    GraphRelationship, ResumePlan, RollingContext, Thread, MAX_CHECKPOINT_LENGTH,
};
use std::collections::HashMap;

pub const MAX_THREAD_EVENTS: usize = 300;
pub const MAX_TIMELINE_ENTRIES: usize = 200;
pub const MAX_GRAPH_NODES: usize = 500;
pub const MAX_GRAPH_EDGES: usize = 1_000;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("no active Thread")]
    NoActiveThread,
    #[error("a different Thread is already active")]
    AnotherThreadActive,
    #[error(transparent)]
    Domain(#[from] DomainError),
}

pub struct CoreEngine {
    pub rolling: RollingContext,
    pub policy: CapturePolicy,
    threads: HashMap<String, Thread>,
    active_thread_id: Option<String>,
}

impl Default for CoreEngine {
    fn default() -> Self {
        Self::new(RollingContext::default(), CapturePolicy::default())
    }
}

impl CoreEngine {
    pub fn new(rolling: RollingContext, policy: CapturePolicy) -> Self {
        Self {
            rolling,
            policy,
            threads: HashMap::new(),
            active_thread_id: None,
        }
    }

    /// Insert persisted state while maintaining the global one-active-thread
    /// invariant. `list_threads` is ordered newest-first, so the first active
    /// row wins deterministically during startup recovery.
    pub fn insert_thread(&mut self, mut thread: Thread) {
        if thread.active
            && (self.active_thread_id.is_none()
                || self.active_thread_id.as_deref() == Some(thread.id.as_str()))
        {
            self.active_thread_id = Some(thread.id.clone());
        } else if thread.active {
            thread.active = false;
        }
        self.threads.insert(thread.id.clone(), thread);
    }

    pub fn active_thread_id(&self) -> Option<&str> {
        self.active_thread_id.as_deref()
    }

    /// Restore a mutation and its index together. This is intentionally
    /// separate from `insert_thread`; rollback must not infer the active id
    /// from a partially restored object.
    pub fn restore_thread_state(&mut self, thread: Thread, active_thread_id: Option<String>) {
        let id = thread.id.clone();
        self.threads.insert(id, thread);
        self.active_thread_id =
            active_thread_id.filter(|active_id| self.threads.contains_key(active_id));
        self.reconcile_active_flags();
    }

    pub fn thread(&self, id: &str) -> Option<&Thread> {
        self.threads.get(id)
    }

    pub fn active_thread(&self) -> Option<&Thread> {
        self.active_thread_id
            .as_deref()
            .and_then(|id| self.threads.get(id))
    }

    pub fn start_thread(
        &mut self,
        name: impl Into<String>,
        now: impl Into<String>,
    ) -> Result<&Thread, CoreError> {
        if self.active_thread_id.is_some() {
            return Err(CoreError::AnotherThreadActive);
        }
        let now = now.into();
        let mut thread = Thread::new(name, now.clone())?;
        thread.active = true;
        Self::apply_to_thread(
            &mut thread,
            lifecycle_event(ContextEventType::ThreadStarted, now.clone()),
        );
        self.active_thread_id = Some(thread.id.clone());
        let id = thread.id.clone();
        self.threads.insert(id.clone(), thread);
        Ok(self.threads.get(&id).expect("inserted Thread"))
    }

    pub fn save_recent_as_thread(
        &mut self,
        name: impl Into<String>,
        now: impl Into<String>,
    ) -> Result<&Thread, CoreError> {
        if self.active_thread_id.is_some() {
            return Err(CoreError::AnotherThreadActive);
        }
        let now = now.into();
        let mut thread = Thread::new(name, now.clone())?;
        thread.active = true;
        for event in self.rolling.events.clone() {
            Self::apply_to_thread(&mut thread, event);
        }
        if thread.events.is_empty() {
            return Err(CoreError::NoActiveThread);
        }
        Self::apply_to_thread(
            &mut thread,
            lifecycle_event(ContextEventType::ThreadStarted, now),
        );
        self.active_thread_id = Some(thread.id.clone());
        let id = thread.id.clone();
        self.threads.insert(id.clone(), thread);
        Ok(self.threads.get(&id).expect("inserted Thread"))
    }

    pub fn record(&mut self, event: ContextEvent, now: &str) -> bool {
        let accepted = self.rolling.push(event.clone(), &self.policy, now);
        if !accepted {
            return false;
        }
        if let Some(id) = self.active_thread_id.clone() {
            if let Some(mut thread) = self.threads.remove(&id) {
                Self::apply_to_thread(&mut thread, event);
                self.threads.insert(id, thread);
            }
        }
        true
    }

    pub fn set_checkpoint(
        &mut self,
        text: Option<String>,
        now: impl Into<String>,
    ) -> Result<(), CoreError> {
        let now = now.into();
        let thread = self.active_thread_mut()?;
        thread.checkpoint = text
            .map(|value| {
                bounded_text(value, MAX_CHECKPOINT_LENGTH, "Checkpoint").map(|text| Checkpoint {
                    text,
                    created_at: now.clone(),
                })
            })
            .transpose()?;
        let event_type = if thread.checkpoint.is_some() {
            ContextEventType::CheckpointUpdated
        } else {
            ContextEventType::CheckpointCleared
        };
        Self::apply_to_thread(thread, lifecycle_event(event_type, now.clone()));
        thread.saved_at = now;
        Ok(())
    }

    pub fn stop_thread(&mut self, now: impl Into<String>) -> Result<Thread, CoreError> {
        let id = self
            .active_thread_id
            .clone()
            .ok_or(CoreError::NoActiveThread)?;
        let now = now.into();
        let thread = self.threads.get_mut(&id).ok_or(CoreError::NoActiveThread)?;
        thread.active = false;
        Self::apply_to_thread(
            thread,
            lifecycle_event(ContextEventType::ThreadStopped, now.clone()),
        );
        thread.saved_at = now;
        self.active_thread_id = None;
        Ok(thread.clone())
    }

    pub fn resume_thread(
        &mut self,
        id: &str,
        now: impl Into<String>,
    ) -> Result<ResumePlan, CoreError> {
        if self
            .active_thread_id
            .as_deref()
            .is_some_and(|active| active != id)
        {
            return Err(CoreError::AnotherThreadActive);
        }
        let thread = self.threads.get_mut(id).ok_or(CoreError::NoActiveThread)?;
        thread.active = true;
        let now = now.into();
        thread.last_resumed_at = Some(now.clone());
        Self::apply_to_thread(
            thread,
            lifecycle_event(ContextEventType::ThreadResumed, now.clone()),
        );
        thread.saved_at = now;
        self.active_thread_id = Some(id.to_owned());
        Ok(build_resume_plan(thread))
    }

    pub fn resume_plan(&self, id: &str) -> Option<ResumePlan> {
        self.threads.get(id).map(build_resume_plan)
    }

    pub fn attach_reference(
        &mut self,
        source: impl Into<String>,
        url: String,
        title: Option<String>,
        now: impl Into<String>,
    ) -> Result<bool, CoreError> {
        let now = now.into();
        let source = source.into();
        let reference = self
            .policy
            .sanitize_reference(ExternalReference {
                url: url.clone(),
                title: title.clone(),
                captured_at: now.clone(),
            });
        let Some(reference) = reference else {
            return Ok(false);
        };
        let event = ContextEvent {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: now.clone(),
            event_type: ContextEventType::ExplicitReference,
            application: None,
            artifact: Some(crate::ArtifactRef {
                kind: crate::ArtifactKind::WebPage,
                display_name: title.unwrap_or_else(|| url.clone()),
                reference: url,
            }),
            workspace: None,
            location: None,
            source,
            private_browsing: false,
        };
        if !self.policy.accepts(&event, &now) {
            return Ok(false);
        }
        let thread = self.active_thread_mut()?;
        thread.references.retain(|item| item.url != reference.url);
        thread.references.push(reference);
        Self::apply_to_thread(thread, event);
        thread.saved_at = now;
        Ok(true)
    }

    pub fn delete_thread(&mut self, id: &str) -> bool {
        if self.active_thread_id.as_deref() == Some(id) {
            self.active_thread_id = None;
        }
        self.threads.remove(id).is_some()
    }

    pub fn threads(&self) -> impl Iterator<Item = &Thread> {
        self.threads.values()
    }

    pub fn clear_threads(&mut self) {
        self.threads.clear();
        self.active_thread_id = None;
    }

    fn reconcile_active_flags(&mut self) {
        let active_id = self.active_thread_id.clone();
        for (id, thread) in &mut self.threads {
            thread.active = active_id.as_deref() == Some(id.as_str());
        }
    }

    fn active_thread_mut(&mut self) -> Result<&mut Thread, CoreError> {
        let id = self
            .active_thread_id
            .as_deref()
            .ok_or(CoreError::NoActiveThread)?;
        self.threads.get_mut(id).ok_or(CoreError::NoActiveThread)
    }

    fn apply_to_thread(thread: &mut Thread, event: ContextEvent) {
        if thread.events.len() >= MAX_THREAD_EVENTS {
            thread.events.remove(0);
        }
        let artifact_id = event.artifact.as_ref().map(|artifact| {
            let key = format!("{}:{}", artifact.kind_string(), artifact.reference);
            if let Some(existing) = thread.artifacts.iter_mut().find(|item| item.id == key) {
                existing.last_observed = event.timestamp.clone();
                existing.visit_count = existing.visit_count.saturating_add(1);
                if matches!(
                    event.event_type,
                    ContextEventType::FileEdited | ContextEventType::DocumentEdited
                ) {
                    existing.edit_count = existing.edit_count.saturating_add(1);
                }
            } else if thread.artifacts.len() < MAX_GRAPH_NODES {
                thread.artifacts.push(ContextArtifact {
                    id: key.clone(),
                    kind: artifact.kind.clone(),
                    display_name: artifact.display_name.clone(),
                    source: event.source.clone(),
                    safe_reference: artifact.reference.clone(),
                    first_observed: event.timestamp.clone(),
                    last_observed: event.timestamp.clone(),
                    visit_count: 1,
                    edit_count: if matches!(
                        event.event_type,
                        ContextEventType::FileEdited | ContextEventType::DocumentEdited
                    ) {
                        1
                    } else {
                        0
                    },
                });
            }
            key
        });

        let coalescible = matches!(
            &event.event_type,
            ContextEventType::FileEdited
                | ContextEventType::DocumentEdited
                | ContextEventType::FileFocused
                | ContextEventType::ApplicationFocused
        );
        let duplicate_low_value_event = coalescible
            && thread.events.last().is_some_and(|previous| {
                previous.event_type == event.event_type && previous.artifact == event.artifact
            });
        if duplicate_low_value_event {
            if let Some(previous) = thread.events.last_mut() {
                previous.timestamp = event.timestamp.clone();
            }
            if let Some(previous) = thread.timeline.last_mut() {
                previous.timestamp = event.timestamp;
                previous.count = previous.count.saturating_add(1);
            }
            return;
        }

        thread.events.push(event.clone());
        if let Some(artifact_id) = artifact_id.clone() {
            push_node(
                &mut thread.graph,
                artifact_id.clone(),
                event.timestamp.clone(),
            );
            if let Some(previous) = thread
                .events
                .iter()
                .rev()
                .skip(1)
                .find_map(|previous| previous.artifact.as_ref())
            {
                let previous_id = format!("{}:{}", previous.kind_string(), previous.reference);
                if previous_id != artifact_id {
                    push_edge(
                        &mut thread.graph,
                        previous_id,
                        artifact_id.clone(),
                        event.timestamp.clone(),
                    );
                }
            }
        }
        let timeline = crate::TimelineEntry {
            timestamp: event.timestamp,
            event_type: event.event_type,
            artifact_id,
            count: 1,
        };
        if thread.timeline.len() >= MAX_TIMELINE_ENTRIES {
            thread.timeline.remove(0);
        }
        thread.timeline.push(timeline);
    }
}

fn lifecycle_event(event_type: ContextEventType, timestamp: String) -> ContextEvent {
    ContextEvent {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp,
        event_type,
        application: None,
        artifact: None,
        workspace: None,
        location: None,
        source: "core".into(),
        private_browsing: false,
    }
}

trait ArtifactKindString {
    fn kind_string(&self) -> &'static str;
}
impl ArtifactKindString for crate::ArtifactRef {
    fn kind_string(&self) -> &'static str {
        match self.kind {
            crate::ArtifactKind::Application => "application",
            crate::ArtifactKind::File => "file",
            crate::ArtifactKind::Folder => "folder",
            crate::ArtifactKind::Workspace => "workspace",
            crate::ArtifactKind::Repository => "repository",
            crate::ArtifactKind::Document => "document",
            crate::ArtifactKind::Pdf => "pdf",
            crate::ArtifactKind::WebPage => "web_page",
            crate::ArtifactKind::Ticket => "ticket",
            crate::ArtifactKind::Spreadsheet => "spreadsheet",
        }
    }
}

fn push_node(graph: &mut ContextGraph, id: String, timestamp: String) {
    if let Some(node) = graph.nodes.iter_mut().find(|node| node.artifact_id == id) {
        node.last_observed_at = timestamp;
    } else if graph.nodes.len() < MAX_GRAPH_NODES {
        graph.nodes.push(GraphNode {
            artifact_id: id,
            last_observed_at: timestamp,
        });
    }
}

fn push_edge(graph: &mut ContextGraph, from: String, to: String, timestamp: String) {
    if let Some(edge) = graph
        .edges
        .iter_mut()
        .find(|edge| edge.from_artifact_id == from && edge.to_artifact_id == to)
    {
        edge.count = edge.count.saturating_add(1);
        edge.last_observed_at = timestamp;
    } else if graph.edges.len() < MAX_GRAPH_EDGES {
        graph.edges.push(GraphEdge {
            from_artifact_id: from,
            to_artifact_id: to,
            relationship: GraphRelationship::Transition,
            count: 1,
            last_observed_at: timestamp,
        });
    }
}
