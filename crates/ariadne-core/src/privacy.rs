use crate::{ContextEvent, ExternalReference};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CapturePolicy {
    pub paused_until: Option<String>,
    pub excluded_applications: Vec<String>,
    pub excluded_browser_domains: Vec<String>,
    pub capture_private_browsing: bool,
}

impl Default for CapturePolicy {
    fn default() -> Self {
        Self {
            paused_until: None,
            excluded_applications: Vec::new(),
            excluded_browser_domains: Vec::new(),
            capture_private_browsing: false,
        }
    }
}

impl CapturePolicy {
    pub fn accepts(&self, event: &ContextEvent, now: &str) -> bool {
        if self.paused_until.as_deref().is_some_and(|until| until > now) {
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
        if event.event_type == crate::ContextEventType::BrowserNavigation
            || event.event_type == crate::ContextEventType::BrowserTabFocused
        {
            if let Some(reference) = event.artifact.as_ref().map(|artifact| artifact.reference.as_str()) {
                if let Some(domain) = domain_from_url(reference) {
                    if self.excluded_browser_domains.iter().any(|excluded| {
                        domain == excluded || domain.ends_with(&format!(".{excluded}"))
                    }) {
                        return false;
                    }
                }
            }
        }
        true
    }

    pub fn sanitize_reference(&self, reference: ExternalReference) -> Option<ExternalReference> {
        let mut url = reference.url.trim().to_owned();
        if url.chars().count() > crate::MAX_REFERENCE_URL_LENGTH {
            return None;
        }
        let lower = url.to_ascii_lowercase();
        if !lower.starts_with("http://") && !lower.starts_with("https://") {
            return None;
        }
        if let Some(index) = url.find('?') {
            url.truncate(index);
        }
        if let Some(index) = url.find('#') {
            url.truncate(index);
        }
        Some(ExternalReference { url, ..reference })
    }
}

fn domain_from_url(value: &str) -> Option<String> {
    let without_scheme = value.split_once("://")?.1;
    let host = without_scheme.split(['/', '?', '#']).next()?.to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}
