use crate::{ContextArtifact, Thread};
use serde::{Deserialize, Serialize};

pub const MAX_SUPPORTING_ARTIFACTS: usize = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResumePlan {
    pub thread_id: String,
    pub primary_artifact: Option<ContextArtifact>,
    pub supporting_artifacts: Vec<ContextArtifact>,
    pub involved_applications: Vec<String>,
    pub checkpoint: Option<String>,
    pub references: Vec<String>,
    pub saved_at: String,
}

pub fn build_resume_plan(thread: &Thread) -> ResumePlan {
    let mut artifacts = thread.artifacts.clone();
    artifacts.sort_by(|left, right| {
        right
            .last_observed
            .cmp(&left.last_observed)
            .then_with(|| right.edit_count.cmp(&left.edit_count))
            .then_with(|| right.visit_count.cmp(&left.visit_count))
            .then_with(|| left.id.cmp(&right.id))
    });
    let primary_artifact = artifacts.first().cloned();
    let supporting_artifacts = artifacts
        .into_iter()
        .skip(1)
        .take(MAX_SUPPORTING_ARTIFACTS)
        .collect();
    let mut involved_applications = thread
        .events
        .iter()
        .filter_map(|event| event.application.as_ref().map(|app| app.display_name.clone()))
        .collect::<Vec<_>>();
    involved_applications.sort();
    involved_applications.dedup();

    ResumePlan {
        thread_id: thread.id.clone(),
        primary_artifact,
        supporting_artifacts,
        involved_applications,
        checkpoint: thread.checkpoint.as_ref().map(|checkpoint| checkpoint.text.clone()),
        references: thread.references.iter().map(|reference| reference.url.clone()).collect(),
        saved_at: thread.saved_at.clone(),
    }
}
