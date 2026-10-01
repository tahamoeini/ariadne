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
                    &format!("2026-01-01T00:{:02}:{:02}Z", index / 60, index % 60),
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
        policy
            .excluded_browser_domains
            .push("private.example".into());

        let mut application_event = event(
            "application",
            "2026-01-01T00:00:00Z",
            ContextEventType::ApplicationFocused,
            Some("password-manager"),
        );
        application_event.application.as_mut().unwrap().identity = "password-manager".into();
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
    fn browser_events_are_sanitized_before_they_enter_thread_state() {
        let mut core = CoreEngine::default();
        core.start_thread("browser", "2026-01-01T00:00:00Z")
            .unwrap();
        let mut browser_event = event(
            "browser-1",
            "2026-01-01T00:00:01Z",
            ContextEventType::BrowserNavigation,
            Some("https://docs.example.test/guide?token=secret#section"),
        );
        browser_event.artifact.as_mut().unwrap().kind = ArtifactKind::WebPage;

        assert!(core.record(browser_event, "2026-01-01T00:00:01Z"));

        let thread = core.active_thread().unwrap();
        assert_eq!(
            thread.artifacts[0].safe_reference,
            "https://docs.example.test/guide"
        );
        assert!(!serde_json::to_string(thread).unwrap().contains("secret"));
    }

    #[test]
    fn explicit_references_obey_domain_exclusions_and_strip_sensitive_url_parts() {
        let mut core = CoreEngine::default();
        core.start_thread("references", "2026-01-01T00:00:00Z")
            .unwrap();
        core.policy
            .excluded_browser_domains
            .push("example.test".into());

        assert!(!core
            .attach_reference(
                "browser",
                "https://docs.example.test:8443/guide?token=secret".into(),
                None,
                "2026-01-01T00:00:01Z",
            )
            .unwrap());
        assert!(core.active_thread().unwrap().references.is_empty());

        core.policy.excluded_browser_domains.clear();
        assert!(core
            .attach_reference(
                "browser",
                "https://docs.example.test/guide?token=secret#section".into(),
                Some("Guide".into()),
                "2026-01-01T00:00:02Z",
            )
            .unwrap());
        assert_eq!(
            core.active_thread().unwrap().references[0].url,
            "https://docs.example.test/guide"
        );
        assert!(!serde_json::to_string(core.active_thread().unwrap())
            .unwrap()
            .contains("secret"));
    }

    #[test]
    fn invalid_or_credential_bearing_browser_urls_are_rejected() {
        let mut core = CoreEngine::default();
        core.start_thread("browser", "2026-01-01T00:00:00Z")
            .unwrap();
        let mut browser_event = event(
            "browser-1",
            "2026-01-01T00:00:01Z",
            ContextEventType::BrowserNavigation,
            Some("https://user:password@example.test/private"),
        );
        browser_event.artifact.as_mut().unwrap().kind = ArtifactKind::WebPage;

        assert!(!core.record(browser_event, "2026-01-01T00:00:01Z"));
        assert!(core.active_thread().unwrap().artifacts.is_empty());
    }

    #[test]
    fn explicit_references_reject_oversized_source_and_timestamp_fields() {
        let mut core = CoreEngine::default();
        core.start_thread("bounded input", "2026-01-01T00:00:00Z")
            .unwrap();

        assert!(!core
            .attach_reference(
                "x".repeat(MAX_EVENT_SOURCE_LENGTH + 1),
                "https://example.test".into(),
                None,
                "2026-01-01T00:00:01Z",
            )
            .unwrap());
        assert!(!core
            .attach_reference(
                "browser",
                "https://example.test".into(),
                None,
                "x".repeat(MAX_EVENT_TIMESTAMP_LENGTH + 1),
            )
            .unwrap());
        assert!(core.active_thread().unwrap().references.is_empty());
    }

    #[test]
    fn malformed_timestamps_are_rejected_before_admission_and_retention() {
        let mut core = CoreEngine::default();
        core.start_thread("timestamp validation", "2026-01-01T00:00:00Z")
            .unwrap();
        let malformed_event = event(
            "malformed-time",
            "not-a-timestamp",
            ContextEventType::FileFocused,
            Some("src/main.rs"),
        );

        assert!(!core.record(malformed_event.clone(), "2026-01-01T00:00:01Z"));
        assert!(!core
            .attach_reference(
                "browser",
                "https://example.test/guide".into(),
                None,
                "not-a-timestamp",
            )
            .unwrap());
        assert!(core.rolling.events.is_empty());
        assert!(core.active_thread().unwrap().artifacts.is_empty());

        let mut rolling = RollingContext::new(1_200, 10);
        rolling.events.push(malformed_event);
        rolling.prune("2026-01-01T00:00:01Z");
        assert!(rolling.events.is_empty());
    }

    #[test]
    fn thread_reference_history_is_bounded() {
        let mut core = CoreEngine::default();
        core.start_thread("bounded references", "2026-01-01T00:00:00Z")
            .unwrap();

        for index in 0..(MAX_THREAD_REFERENCES + 10) {
            assert!(core
                .attach_reference(
                    "browser",
                    format!("https://docs.example.test/{index}"),
                    None,
                    "2026-01-01T00:00:01Z",
                )
                .unwrap());
        }

        assert_eq!(
            core.active_thread().unwrap().references.len(),
            MAX_THREAD_REFERENCES
        );
    }

    #[test]
    fn clearing_all_threads_also_erases_the_rolling_buffer() {
        let mut core = CoreEngine::default();
        assert!(core.record(
            event(
                "recent-1",
                "2026-01-01T00:00:00Z",
                ContextEventType::FileFocused,
                Some("src/main.rs"),
            ),
            "2026-01-01T00:00:01Z",
        ));
        assert_eq!(core.rolling.events.len(), 1);

        core.clear_threads();

        assert!(core.rolling.events.is_empty());
        assert_eq!(core.threads().count(), 0);
        assert_eq!(core.active_thread_id(), None);
    }

    #[test]
    fn rolling_retention_uses_real_time_across_month_boundaries() {
        let mut rolling = RollingContext::new(20 * 60, 10);
        let policy = CapturePolicy::default();
        assert!(rolling.push(
            event(
                "before-midnight",
                "2026-05-01T01:50:00+02:00",
                ContextEventType::FileFocused,
                Some("src/before.rs"),
            ),
            &policy,
            "2026-04-30T23:50:00Z",
        ));
        assert!(rolling.push(
            event(
                "after-midnight",
                "2026-05-01T00:05:00Z",
                ContextEventType::FileFocused,
                Some("src/after.rs"),
            ),
            &policy,
            "2026-05-01T00:05:00Z",
        ));
        assert_eq!(rolling.events.len(), 2);

        rolling.prune("2026-05-01T00:11:00Z");

        assert_eq!(rolling.events.len(), 1);
        assert_eq!(rolling.events[0].id, "after-midnight");
    }

    #[test]
    fn saving_recent_context_prunes_expired_events_even_without_new_activity() {
        let mut core = CoreEngine::default();
        assert!(core.record(
            event(
                "old-event",
                "2026-01-01T00:00:00Z",
                ContextEventType::FileFocused,
                Some("src/old.rs"),
            ),
            "2026-01-01T00:00:00Z",
        ));

        assert!(matches!(
            core.save_recent_as_thread("too old", "2026-01-01T00:20:01Z"),
            Err(CoreError::NoActiveThread)
        ));
        assert!(core.rolling.events.is_empty());
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

    #[test]
    fn resume_brief_is_trimmed_persisted_and_included_in_the_resume_plan() {
        let mut core = CoreEngine::default();
        core.start_thread("resume me", "2026-01-01T00:00:00Z")
            .unwrap();
        let brief = ResumeBrief {
            context_and_findings: Some("  The refresh race starts after retry  ".into()),
            decisions: Some("Keep the retry guard in the coordinator".into()),
            key_artifacts: Some("src/coordinator.rs; issue 42".into()),
            open_questions: Some("Can the race be reproduced under load?".into()),
            next_step: Some("Add a regression test for delayed retries".into()),
        };

        core.set_resume_brief(Some(brief), "2026-01-01T00:01:00Z")
            .unwrap();

        let thread = core.active_thread().unwrap();
        assert!(thread.checkpoint.is_none());
        assert_eq!(
            thread
                .resume_brief
                .as_ref()
                .unwrap()
                .context_and_findings
                .as_deref(),
            Some("The refresh race starts after retry")
        );
        assert_eq!(
            core.resume_plan(&thread.id).unwrap().resume_brief,
            thread.resume_brief
        );

        core.set_resume_brief(Some(ResumeBrief::default()), "2026-01-01T00:02:00Z")
            .unwrap();
        assert!(core.active_thread().unwrap().resume_brief.is_none());
    }

    #[test]
    fn old_thread_payloads_load_without_a_resume_brief() {
        let thread = Thread::new("legacy", "2026-01-01T00:00:00Z").unwrap();
        let mut value = serde_json::to_value(thread).unwrap();
        value.as_object_mut().unwrap().remove("resume_brief");

        let loaded: Thread = serde_json::from_value(value).unwrap();
        assert!(loaded.resume_brief.is_none());
    }

    #[test]
    fn oversized_resume_brief_is_rejected_without_changing_the_thread() {
        let mut core = CoreEngine::default();
        core.start_thread("bounded brief", "2026-01-01T00:00:00Z")
            .unwrap();
        let before = core.active_thread().unwrap().clone();
        let oversized = ResumeBrief {
            context_and_findings: Some("x".repeat(MAX_RESUME_BRIEF_FIELD_LENGTH + 1)),
            ..ResumeBrief::default()
        };

        assert!(core
            .set_resume_brief(Some(oversized), "2026-01-01T00:01:00Z")
            .is_err());
        assert_eq!(core.active_thread().unwrap(), &before);
    }
}
