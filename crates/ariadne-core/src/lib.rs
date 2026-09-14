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

    fn event(
        id: &str,
        timestamp: &str,
        event_type: ContextEventType,
        reference: Option<&str>,
    ) -> ContextEvent {
        ContextEvent {
            id: id.into(),
            timestamp: timestamp.into(),
            event_type,
            application: Some(ApplicationContext {
                identity: "editor".into(),
                display_name: "Editor".into(),
                executable: None,
            }),
            artifact: reference.map(|value| ArtifactRef {
                kind: ArtifactKind::File,
                display_name: value.into(),
                reference: value.into(),
            }),
            workspace: None,
            location: None,
            source: "test".into(),
            private_browsing: false,
        }
    }

    #[test]
    fn start_is_from_now_and_retroactive_save_uses_only_rolling_events() {
        let mut core = CoreEngine::default();
        assert!(core.record(
            event(
                "1",
                "2026-01-01T00:00:00Z",
                ContextEventType::FileFocused,
                Some("a")
            ),
            "2026-01-01T00:00:01Z"
        ));
        let thread = core
            .save_recent_as_thread("retroactive", "2026-01-01T00:00:02Z")
            .unwrap();
        assert_eq!(thread.events.len(), 2);
        let mut fresh = CoreEngine::default();
        let fresh_thread = fresh
            .start_thread("from now", "2026-01-01T00:00:00Z")
            .unwrap();
        assert_eq!(fresh_thread.events.len(), 1);
    }

    #[test]
    fn paused_and_private_events_are_not_accepted() {
        let mut core = CoreEngine::default();
        core.policy.paused_until = Some("9999-12-31T23:59:59Z".into());
        assert!(!core.record(
            event(
                "1",
                "2026-01-01T00:00:00Z",
                ContextEventType::FileFocused,
                Some("a")
            ),
            "2026-01-01T00:00:01Z"
        ));
        core.policy.paused_until = None;
        let mut private = event(
            "2",
            "2026-01-01T00:00:01Z",
            ContextEventType::BrowserTabFocused,
            Some("https://example.com/?secret=1"),
        );
        private.private_browsing = true;
        assert!(!core.record(private, "2026-01-01T00:00:02Z"));
    }

    #[test]
    fn repeated_low_value_events_coalesce_without_dropping_lifecycle_events() {
        let mut core = CoreEngine::default();
        core.start_thread("test", "2026-01-01T00:00:00Z").unwrap();
        for index in 0..100 {
            assert!(core.record(
                event(
                    &format!("focus-{index}"),
                    &format!("2026-01-01T00:00:{index:02}Z"),
                    ContextEventType::FileFocused,
                    Some("src/main.rs")
                ),
                "2026-01-01T00:02:00Z"
            ));
        }
        let thread = core.active_thread().unwrap();
        assert_eq!(thread.events.len(), 2);
        assert_eq!(thread.timeline.last().unwrap().count, 100);
        core.stop_thread("2026-01-01T00:03:00Z").unwrap();
        assert!(matches!(
            core.threads()
                .next()
                .unwrap()
                .events
                .last()
                .unwrap()
                .event_type,
            ContextEventType::ThreadStopped
        ));
    }

    #[test]
    fn exclusions_reject_application_and_browser_domain_events() {
        let mut policy = CapturePolicy::default();
        policy.excluded_applications.push("password-manager".into());
        policy.excluded_browser_domains.push("private.example".into());

        let mut application_event = event(
            "application",
            "2026-01-01T00:00:00Z",
            ContextEventType::ApplicationFocused,
            Some("password-manager"),
        );
        application_event.application.as_mut().unwrap().identity =
            "password-manager".into();
        assert!(!policy.accepts(&application_event, "2026-01-01T00:00:01Z"));

        let browser_event = event(
            "browser",
            "2026-01-01T00:00:00Z",
            ContextEventType::BrowserNavigation,
            Some("https://private.example/path?secret=1"),
        );
        assert!(!policy.accepts(&browser_event, "2026-01-01T00:00:01Z"));
    }

    #[test]
    fn expired_timed_pause_returns_to_running() {
        let mut policy = CapturePolicy::default();
        policy.set_timed_pause(Some("2026-01-01T00:10:00Z".into()));
        assert!(policy.is_paused("2026-01-01T00:09:59Z"));
        assert!(!policy.is_paused("2026-01-01T00:10:00Z"));
        assert!(matches!(
            policy.pause_state("2026-01-01T00:10:00Z"),
            PauseState::Running
        ));
    }

    #[test]
    fn insert_thread_keeps_only_one_active_thread() {
        let mut core = CoreEngine::default();
        let mut first = Thread::new("first", "2026-01-01T00:00:00Z").unwrap();
        first.active = true;
        let mut second = Thread::new("second", "2026-01-01T00:01:00Z").unwrap();
        second.active = true;
        core.insert_thread(first.clone());
        core.insert_thread(second.clone());
        assert_eq!(core.active_thread_id(), Some(first.id.as_str()));
        assert!(core.thread(&first.id).unwrap().active);
        assert!(!core.thread(&second.id).unwrap().active);
    }

    #[test]
    fn restore_thread_state_restores_object_and_active_index() {
        let mut core = CoreEngine::default();
        let mut thread = Thread::new("saved", "2026-01-01T00:00:00Z").unwrap();
        thread.active = false;
        core.insert_thread(thread.clone());
        let _ = core
            .resume_thread(&thread.id, "2026-01-01T00:01:00Z")
            .unwrap();
        core.restore_thread_state(thread.clone(), None);
        assert!(!core.thread(&thread.id).unwrap().active);
        assert_eq!(core.active_thread_id(), None);
    }

    #[test]
    fn graph_and_resume_plan_are_bounded() {
        let mut core = CoreEngine::default();
        core.start_thread("bounded", "2026-01-01T00:00:00Z")
            .unwrap();
        for index in 0..(MAX_THREAD_EVENTS + 20) {
            let reference = format!("file-{index}.txt");
            let timestamp = format!("2026-01-01T00:{:02}:00Z", index % 60);
            core.record(
                event(
                    &index.to_string(),
                    &timestamp,
                    ContextEventType::FileFocused,
                    Some(&reference),
                ),
                "2026-01-01T23:59:59Z",
            );
        }
        let thread = core.active_thread().unwrap();
        assert!(thread.events.len() <= MAX_THREAD_EVENTS);
        assert!(thread.timeline.len() <= MAX_TIMELINE_ENTRIES);
        assert!(thread.graph.nodes.len() <= MAX_GRAPH_NODES);
        assert!(build_resume_plan(thread).supporting_artifacts.len() <= MAX_SUPPORTING_ARTIFACTS);
    }
}
