use crate::{ContextEvent, ExternalReference};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PauseState {
    Running,
    Timed { until: String },
    Manual,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapturePolicy {
    /// Kept as an option for backwards-compatible policy JSON. It is active
    /// only while the timestamp is later than the caller's current time.
    pub paused_until: Option<String>,
    #[serde(default)]
    pub paused_manually: bool,
    pub excluded_applications: Vec<String>,
    pub excluded_browser_domains: Vec<String>,
    pub capture_private_browsing: bool,
}

impl CapturePolicy {
    pub fn pause_state(&self, now: &str) -> PauseState {
        if self.paused_manually {
            PauseState::Manual
        } else if let Some(until) = self.paused_until.as_deref().filter(|until| *until > now) {
            PauseState::Timed {
                until: until.to_owned(),
            }
        } else {
            PauseState::Running
        }
    }

    pub fn is_paused(&self, now: &str) -> bool {
        !matches!(self.pause_state(now), PauseState::Running)
    }

    pub fn set_manual_pause(&mut self, paused: bool) {
        self.paused_manually = paused;
        if paused {
            self.paused_until = None;
        }
    }

    pub fn set_timed_pause(&mut self, until: Option<String>) {
        self.paused_manually = false;
        self.paused_until = until;
    }

    pub fn accepts(&self, event: &ContextEvent, now: &str) -> bool {
        if self.is_paused(now) {
            return false;
        }
        if event.application.as_ref().is_some_and(|application| {
            self.excluded_applications.iter().any(|excluded| {
                excluded.eq_ignore_ascii_case(&application.identity)
                    || application
                        .executable
                        .as_ref()
                        .is_some_and(|executable| excluded.eq_ignore_ascii_case(executable))
            })
        }) {
            return false;
        }
        if !self.capture_private_browsing && event.private_browsing {
            return false;
        }
        let browser_event = matches!(
            &event.event_type,
            crate::ContextEventType::BrowserNavigation
                | crate::ContextEventType::BrowserTabFocused
                | crate::ContextEventType::ExplicitReference
        );
        let web_page_artifact = event
            .artifact
            .as_ref()
            .is_some_and(|artifact| artifact.kind == crate::ArtifactKind::WebPage);
        if browser_event || web_page_artifact {
            let Some(reference) = event
                .artifact
                .as_ref()
                .filter(|artifact| artifact.kind == crate::ArtifactKind::WebPage)
                .map(|artifact| artifact.reference.as_str())
            else {
                return false;
            };
            let Some(domain) = domain_from_url(reference) else {
                return false;
            };
            if self.excluded_browser_domains.iter().any(|excluded| {
                let excluded = excluded
                    .trim()
                    .trim_start_matches('.')
                    .trim_end_matches('.')
                    .to_ascii_lowercase();
                !excluded.is_empty()
                    && (domain == excluded || domain.ends_with(&format!(".{excluded}")))
            }) {
                return false;
            }
        }
        true
    }

    pub fn sanitize_event(&self, mut event: ContextEvent) -> Option<ContextEvent> {
        if event.id.chars().count() > crate::MAX_EVENT_ID_LENGTH
            || event.timestamp.chars().count() > crate::MAX_EVENT_TIMESTAMP_LENGTH
            || DateTime::parse_from_rfc3339(&event.timestamp).is_err()
            || event.source.chars().count() > crate::MAX_EVENT_SOURCE_LENGTH
        {
            return None;
        }

        if let Some(application) = event.application.as_mut() {
            if application.identity.chars().count() > crate::MAX_APPLICATION_IDENTITY_LENGTH
                || application.display_name.chars().count() > crate::MAX_TITLE_LENGTH
                || application
                    .executable
                    .as_ref()
                    .is_some_and(|value| value.chars().count() > crate::MAX_REFERENCE_URL_LENGTH)
            {
                return None;
            }
        }

        for artifact in event.artifact.iter_mut().chain(event.workspace.iter_mut()) {
            if artifact.display_name.chars().count() > crate::MAX_TITLE_LENGTH
                || artifact.reference.chars().count() > crate::MAX_REFERENCE_URL_LENGTH
            {
                return None;
            }
            if artifact.kind == crate::ArtifactKind::WebPage {
                artifact.reference = sanitize_http_url(&artifact.reference)?;
                if let Ok(display_url) = Url::parse(&artifact.display_name) {
                    if matches!(display_url.scheme(), "http" | "https") {
                        artifact.display_name = sanitize_http_url(&artifact.display_name)?;
                    }
                }
            }
        }

        if event.location.as_ref().is_some_and(|location| {
            location.reference.chars().count() > crate::MAX_REFERENCE_URL_LENGTH
        }) {
            return None;
        }

        Some(event)
    }

    pub fn sanitize_reference(
        &self,
        mut reference: ExternalReference,
    ) -> Option<ExternalReference> {
        reference.url = sanitize_http_url(&reference.url)?;
        if let Some(title) = reference.title.as_mut() {
            *title = title.chars().take(crate::MAX_TITLE_LENGTH).collect();
        }
        Some(reference)
    }
}

fn domain_from_url(value: &str) -> Option<String> {
    Url::parse(value)
        .ok()?
        .host_str()
        .map(str::to_ascii_lowercase)
}

fn sanitize_http_url(value: &str) -> Option<String> {
    if value.chars().count() > crate::MAX_REFERENCE_URL_LENGTH {
        return None;
    }
    let mut url = Url::parse(value.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    url.set_query(None);
    url.set_fragment(None);
    let sanitized = url.to_string();
    (sanitized.chars().count() <= crate::MAX_REFERENCE_URL_LENGTH).then_some(sanitized)
}
