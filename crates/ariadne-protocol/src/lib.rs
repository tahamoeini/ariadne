//! Versioned local adapter protocol. Transport is intentionally separate from
//! message validation so named pipes, Unix sockets, and Android bridges can
//! reuse the same contract.

use ariadne_core::ContextEvent;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_MESSAGE_BYTES: usize = 128 * 1024;
pub const DEFAULT_QUEUE_CAPACITY: usize = 256;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdapterHello {
    pub protocol_version: u32,
    pub adapter_id: String,
    pub adapter_version: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AdapterMessage {
    Hello(AdapterHello),
    Event { protocol_version: u32, source: String, event: ContextEvent },
    Ping { protocol_version: u32 },
    AttachReference { protocol_version: u32, source: String, url: String, title: Option<String> },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ProtocolError {
    #[error("message exceeds the {MAX_MESSAGE_BYTES}-byte limit")]
    TooLarge,
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u32),
    #[error("adapter identity is required")]
    MissingIdentity,
    #[error("invalid message: {0}")]
    Invalid(String),
}

#[derive(Debug, Clone)]
pub struct BoundedMessageQueue {
    capacity: usize,
    messages: VecDeque<(AdapterMessage, bool)>,
}

impl BoundedMessageQueue {
    pub fn new(capacity: usize) -> Self { Self { capacity: capacity.max(1), messages: VecDeque::new() } }

    /// Critical lifecycle actions are never displaced by ordinary observations.
    /// If a full queue contains only critical messages, a non-critical message
    /// is rejected; if a critical message arrives, the oldest non-critical one
    /// is displaced. The caller can retry or surface a degraded adapter state.
    pub fn push(&mut self, message: AdapterMessage, critical: bool) -> bool {
        if self.messages.len() < self.capacity { self.messages.push_back((message, critical)); return true; }
        if let Some(index) = self.messages.iter().position(|(_, is_critical)| !*is_critical) {
            if critical { self.messages.remove(index); self.messages.push_back((message, critical)); true } else { false }
        } else { false }
    }

    pub fn pop(&mut self) -> Option<AdapterMessage> { self.messages.pop_front().map(|(message, _)| message) }
    pub fn len(&self) -> usize { self.messages.len() }
    pub fn is_empty(&self) -> bool { self.messages.is_empty() }
}

pub fn encode(message: &AdapterMessage) -> Result<Vec<u8>, ProtocolError> {
    let bytes = serde_json::to_vec(message).map_err(|error| ProtocolError::Invalid(error.to_string()))?;
    validate_bytes(&bytes)?;
    Ok(bytes)
}

pub fn decode(bytes: &[u8]) -> Result<AdapterMessage, ProtocolError> {
    validate_bytes(bytes)?;
    let message: AdapterMessage = serde_json::from_slice(bytes).map_err(|error| ProtocolError::Invalid(error.to_string()))?;
    validate_message(&message)?;
    Ok(message)
}

fn validate_bytes(bytes: &[u8]) -> Result<(), ProtocolError> { if bytes.len() > MAX_MESSAGE_BYTES { Err(ProtocolError::TooLarge) } else { Ok(()) } }

fn validate_message(message: &AdapterMessage) -> Result<(), ProtocolError> {
    let version = match message { AdapterMessage::Hello(hello) => { if hello.adapter_id.trim().is_empty() { return Err(ProtocolError::MissingIdentity); } hello.protocol_version }, AdapterMessage::Event { protocol_version, source, .. } => { if source.trim().is_empty() { return Err(ProtocolError::MissingIdentity); } *protocol_version }, AdapterMessage::Ping { protocol_version } => *protocol_version, AdapterMessage::AttachReference { protocol_version, source, .. } => { if source.trim().is_empty() { return Err(ProtocolError::MissingIdentity); } *protocol_version } };
    if version != PROTOCOL_VERSION { return Err(ProtocolError::UnsupportedVersion(version)); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ariadne_core::{ContextEventType, ContextEvent};

    #[test]
    fn protocol_round_trip_and_version_validation() {
        let message = AdapterMessage::Event { protocol_version: 1, source: "vscode".into(), event: ContextEvent { id: "event-1".into(), timestamp: "2026-01-01T00:00:00Z".into(), event_type: ContextEventType::FileFocused, application: None, artifact: None, workspace: None, location: None, source: "vscode".into(), private_browsing: false } };
        let encoded = encode(&message).unwrap();
        assert_eq!(decode(&encoded).unwrap(), message);
        let invalid = AdapterMessage::Ping { protocol_version: 2 };
        assert!(matches!(encode(&invalid).and_then(|bytes| decode(&bytes)), Err(ProtocolError::UnsupportedVersion(2))));
    }

    #[test]
    fn bounded_queue_preserves_critical_actions() {
        let mut queue = BoundedMessageQueue::new(2);
        let ordinary = AdapterMessage::Ping { protocol_version: 1 };
        let critical = AdapterMessage::Ping { protocol_version: 1 };
        assert!(queue.push(ordinary.clone(), false));
        assert!(queue.push(ordinary, false));
        assert!(queue.push(critical, true));
        assert_eq!(queue.len(), 2);
    }
}
