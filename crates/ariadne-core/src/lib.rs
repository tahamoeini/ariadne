//! Portable, deterministic Ariadne domain logic.
//!
//! This crate deliberately has no operating-system, UI, database, or network
//! dependencies. Platform sensors contribute facts; the core decides how those
//! facts become bounded Thread state.

mod domain;
mod engine;
mod privacy;
mod resume;
mod rolling;

pub use domain::*;
pub use engine::*;
pub use privacy::*;
pub use resume::*;
pub use rolling::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn event(id: &str, timestamp: &str, event_type: ContextEventType, reference: Option<&str>) -> ContextEvent {
        ContextEvent {
            id: id.into(), timestamp: timestamp.into(), event_type,
            application: Some(ApplicationContext { identity: "editor".into(), display_name: "Editor".into(), executable: None }),
            artifact: reference.map(|value| ArtifactRef { kind: ArtifactKind::File, display_name: value.into(), reference: value.into() }),
            workspace: None, location: None, source: "test".into(), private_browsing: false,
        }
    }

    #[test]
    fn start_is_from_now_and_retroactive_save_uses_only_rolling_events() {
        let mut core = CoreEngine::default();
        assert!(core.record(event("1", "2026-01-01T00:00:00Z", ContextEventType::FileFocused, Some("a")), "2026-01-01T00:00:01Z"));
        let thread = core.save_recent_as_thread("retroactive", "2026-01-01T00:00:02Z").unwrap();
        assert_eq!(thread.events.len(), 2);
        let mut fresh = CoreEngine::default();
        let fresh_thread = fresh.start_thread("from now", "2026-01-01T00:00:00Z").unwrap();
        assert_eq!(fresh_thread.events.len(), 1);
    }

    #[test]
    fn paused_and_private_events_are_not_accepted() {
        let mut core = CoreEngine::default();
        core.policy.paused_until = Some("9999-12-31T23:59:59Z".into());
        assert!(!core.record(event("1", "2026-01-01T00:00:00Z", ContextEventType::FileFocused, Some("a")), "2026-01-01T00:00:01Z"));
        core.policy.paused_until = None;
        let mut private = event("2", "2026-01-01T00:00:01Z", ContextEventType::BrowserTabFocused, Some("https://example.com/?secret=1"));
        private.private_browsing = true;
        assert!(!core.record(private, "2026-01-01T00:00:02Z"));
    }

    #[test]
    fn graph_and_resume_plan_are_bounded() {
        let mut core = CoreEngine::default();
        core.start_thread("bounded", "2026-01-01T00:00:00Z").unwrap();
        for index in 0..(MAX_THREAD_EVENTS + 20) {
            let reference = format!("file-{index}.txt");
            let timestamp = format!("2026-01-01T00:{:02}:00Z", index % 60);
            core.record(event(&index.to_string(), &timestamp, ContextEventType::FileFocused, Some(&reference)), "2026-01-01T23:59:59Z");
        }
        let thread = core.active_thread().unwrap();
        assert!(thread.events.len() <= MAX_THREAD_EVENTS);
        assert!(thread.timeline.len() <= MAX_TIMELINE_ENTRIES);
        assert!(thread.graph.nodes.len() <= MAX_GRAPH_NODES);
        assert!(build_resume_plan(thread).supporting_artifacts.len() <= MAX_SUPPORTING_ARTIFACTS);
    }
}
