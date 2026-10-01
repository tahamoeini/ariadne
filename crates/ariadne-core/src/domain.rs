use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DOMAIN_VERSION: u32 = 1;
pub const MAX_NAME_LENGTH: usize = 120;
pub const MAX_CHECKPOINT_LENGTH: usize = 2_000;
pub const MAX_RESUME_BRIEF_FIELD_LENGTH: usize = 1_000;
pub const MAX_RESUME_BRIEF_TOTAL_LENGTH: usize = 4_000;
pub const MAX_TITLE_LENGTH: usize = 400;
pub const MAX_REFERENCE_URL_LENGTH: usize = 2_000;
pub const MAX_EVENT_ID_LENGTH: usize = 100;
pub const MAX_EVENT_SOURCE_LENGTH: usize = 100;
pub const MAX_EVENT_TIMESTAMP_LENGTH: usize = 64;
pub const MAX_APPLICATION_IDENTITY_LENGTH: usize = 1_024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    Application,
    File,
    Folder,
    Workspace,
    Repository,
    Document,
    Pdf,
    WebPage,
    Ticket,
    Spreadsheet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApplicationContext {
    pub identity: String,
    pub display_name: String,
    pub executable: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArtifactRef {
    pub kind: ArtifactKind,
    pub display_name: String,
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextArtifact {
    pub id: String,
    pub kind: ArtifactKind,
    pub display_name: String,
    pub source: String,
    pub safe_reference: String,
    pub first_observed: String,
    pub last_observed: String,
    pub visit_count: u32,
    pub edit_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Location {
    pub reference: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextEventType {
    ApplicationFocused,
    ApplicationLeft,
    DocumentFocused,
    DocumentEdited,
    FileFocused,
    FileEdited,
    BrowserTabFocused,
    BrowserNavigation,
    WorkspaceFocused,
    IdleStarted,
    IdleEnded,
    ThreadStarted,
    ThreadStopped,
    ThreadResumed,
    CheckpointCreated,
    CheckpointUpdated,
    CheckpointCleared,
    ResumeBriefUpdated,
    ResumeBriefCleared,
    ExplicitReference,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextEvent {
    pub id: String,
    pub timestamp: String,
    pub event_type: ContextEventType,
    pub application: Option<ApplicationContext>,
    pub artifact: Option<ArtifactRef>,
    pub workspace: Option<ArtifactRef>,
    pub location: Option<Location>,
    pub source: String,
    /// True only when a platform adapter explicitly reports private/incognito
    /// context. The core never tries to infer this from a title or URL.
    #[serde(default)]
    pub private_browsing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExternalReference {
    pub url: String,
    pub title: Option<String>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Checkpoint {
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResumeBrief {
    #[serde(default)]
    pub context_and_findings: Option<String>,
    #[serde(default)]
    pub decisions: Option<String>,
    #[serde(default)]
    pub key_artifacts: Option<String>,
    #[serde(default)]
    pub open_questions: Option<String>,
    #[serde(default)]
    pub next_step: Option<String>,
}

impl ResumeBrief {
    pub fn normalize(self) -> Result<Option<Self>, DomainError> {
        let context_and_findings = normalize_brief_field(
            self.context_and_findings,
            "Resume Brief context and findings",
        )?;
        let decisions = normalize_brief_field(self.decisions, "Resume Brief decisions")?;
        let key_artifacts =
            normalize_brief_field(self.key_artifacts, "Resume Brief key artifacts")?;
        let open_questions =
            normalize_brief_field(self.open_questions, "Resume Brief open questions")?;
        let next_step = normalize_brief_field(self.next_step, "Resume Brief next step")?;
        let total_length = [
            &context_and_findings,
            &decisions,
            &key_artifacts,
            &open_questions,
            &next_step,
        ]
        .into_iter()
        .filter_map(|value| value.as_ref())
        .map(|value| value.chars().count())
        .sum::<usize>();

        if total_length > MAX_RESUME_BRIEF_TOTAL_LENGTH {
            return Err(DomainError::TooLong("Resume Brief"));
        }

        let brief = Self {
            context_and_findings,
            decisions,
            key_artifacts,
            open_questions,
            next_step,
        };
        if brief.is_empty() {
            Ok(None)
        } else {
            Ok(Some(brief))
        }
    }

    pub fn is_empty(&self) -> bool {
        self.context_and_findings.is_none()
            && self.decisions.is_none()
            && self.key_artifacts.is_none()
            && self.open_questions.is_none()
            && self.next_step.is_none()
    }
}

fn normalize_brief_field(
    value: Option<String>,
    field: &'static str,
) -> Result<Option<String>, DomainError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > MAX_RESUME_BRIEF_FIELD_LENGTH {
        return Err(DomainError::TooLong(field));
    }
    Ok(Some(value))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphNode {
    pub artifact_id: String,
    pub last_observed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GraphRelationship {
    Transition,
    Navigation,
    ExplicitReference,
    OpenedFrom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    pub from_artifact_id: String,
    pub to_artifact_id: String,
    pub relationship: GraphRelationship,
    pub count: u32,
    pub last_observed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ContextGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimelineEntry {
    pub timestamp: String,
    pub event_type: ContextEventType,
    pub artifact_id: Option<String>,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Thread {
    pub id: String,
    pub name: String,
    pub workspace: Option<String>,
    pub repository: Option<String>,
    pub created_at: String,
    pub saved_at: String,
    pub last_resumed_at: Option<String>,
    pub active: bool,
    pub checkpoint: Option<Checkpoint>,
    #[serde(default)]
    pub resume_brief: Option<ResumeBrief>,
    pub artifacts: Vec<ContextArtifact>,
    pub events: Vec<ContextEvent>,
    pub timeline: Vec<TimelineEntry>,
    pub graph: ContextGraph,
    pub references: Vec<ExternalReference>,
}

impl Thread {
    pub fn new(name: impl Into<String>, now: impl Into<String>) -> Result<Self, DomainError> {
        let name = bounded_text(name.into(), MAX_NAME_LENGTH, "Thread name")?;
        let now = now.into();
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name,
            workspace: None,
            repository: None,
            created_at: now.clone(),
            saved_at: now,
            last_resumed_at: None,
            active: false,
            checkpoint: None,
            resume_brief: None,
            artifacts: Vec::new(),
            events: Vec::new(),
            timeline: Vec::new(),
            graph: ContextGraph::default(),
            references: Vec::new(),
        })
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("{0} is required")]
    Required(&'static str),
    #[error("{0} exceeds its maximum length")]
    TooLong(&'static str),
    #[error("browser reference must use http:// or https://")]
    InvalidReferenceScheme,
}

pub(crate) fn bounded_text(
    value: String,
    max_length: usize,
    field: &'static str,
) -> Result<String, DomainError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(DomainError::Required(field));
    }
    if value.chars().count() > max_length {
        return Err(DomainError::TooLong(field));
    }
    Ok(value)
}
