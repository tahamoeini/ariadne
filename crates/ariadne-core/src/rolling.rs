use crate::{CapturePolicy, ContextEvent};
use chrono::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollingContext {
    pub events: Vec<ContextEvent>,
    pub retention_seconds: u64,
    pub max_events: usize,
}

impl Default for RollingContext {
    fn default() -> Self {
        Self::new(1_200, 1_000)
    }
}

impl RollingContext {
    pub fn new(retention_seconds: u64, max_events: usize) -> Self {
        Self {
            events: Vec::new(),
            retention_seconds,
            max_events: max_events.max(1),
        }
    }

    pub fn push(&mut self, event: ContextEvent, policy: &CapturePolicy, now: &str) -> bool {
        if !policy.accepts(&event, now) {
            return false;
        }
        self.events.push(event);
        self.prune(now);
        true
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }

    pub(crate) fn prune(&mut self, now: &str) {
        if let Some(now_millis) = parse_epoch_millis(now) {
            let retention_millis = i128::from(self.retention_seconds) * 1_000;
            let cutoff = now_millis - retention_millis;
            self.events.retain(|event| {
                parse_epoch_millis(&event.timestamp).is_some_and(|millis| millis >= cutoff)
            });
        }
        if self.events.len() > self.max_events {
            let remove_count = self.events.len() - self.max_events;
            self.events.drain(..remove_count);
        }
    }
}

fn parse_epoch_millis(value: &str) -> Option<i128> {
    DateTime::parse_from_rfc3339(value).ok().map(|timestamp| {
        i128::from(timestamp.timestamp()) * 1_000 + i128::from(timestamp.timestamp_subsec_millis())
    })
}
