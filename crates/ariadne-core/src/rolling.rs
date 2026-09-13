use crate::{CapturePolicy, ContextEvent};
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

    fn prune(&mut self, now: &str) {
        let cutoff = parse_epoch_seconds(now).saturating_sub(self.retention_seconds);
        self.events
            .retain(|event| parse_epoch_seconds(&event.timestamp) >= cutoff);
        if self.events.len() > self.max_events {
            let remove_count = self.events.len() - self.max_events;
            self.events.drain(..remove_count);
        }
    }
}

fn parse_epoch_seconds(value: &str) -> u64 {
    // ISO-8601 timestamps sort lexically, so malformed values are retained
    // rather than silently treated as ancient data. Platform adapters must
    // provide valid timestamps; this fallback is intentionally conservative.
    if value.len() >= 20 && value.as_bytes().get(4) == Some(&b'-') {
        let year = value
            .get(0..4)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let month = value
            .get(5..7)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let day = value
            .get(8..10)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let hour = value
            .get(11..13)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let minute = value
            .get(14..16)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        let second = value
            .get(17..19)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        return (((year * 12 + month) * 31 + day) * 24 + hour) * 3600 + minute * 60 + second;
    }
    u64::MAX
}
