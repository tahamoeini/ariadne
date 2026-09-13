//! Versioned local adapter protocol.
//! Transport is intentionally separate from message validation so named
//! pipes, Unix sockets, and Android bridges can reuse the same contract.

use ariadne_core::ContextEvent;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_MESSAGE_BYTES: usize = 128 * 1024;
pub const DEFAULT_QUEUE_CAPACITY: usize = 256;
pub const FRAME_HEADER_BYTES: usize = 4;

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
    Event {
        protocol_version: u32,
        source: String,
        event: ContextEvent,
    },
    Ping {
        protocol_version: u32,
    },
    AttachReference {
        protocol_version: u32,
        source: String,
        url: String,
        title: Option<String>,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ProtocolError {
    #[error("message exceeds the {MAX_MESSAGE_BYTES}-byte limit")]
    TooLarge,
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u32),
    #[error("adapter identity is required")]
    MissingIdentity,
    #[error("message source does not match its event source")]
    SourceMismatch,
    #[error("adapter capability is required for this message")]
    CapabilityViolation,
    #[error("invalid frame length")]
    InvalidFrame,
    #[error("invalid message: {0}")]
    Invalid(String),
}

#[derive(Debug, Clone)]
pub struct BoundedMessageQueue {
    capacity: usize,
    messages: VecDeque<(AdapterMessage, bool)>,
}

impl BoundedMessageQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            messages: VecDeque::new(),
        }
    }

    /// Critical lifecycle actions are classified by the protocol rather than
    /// by a caller-supplied boolean.
    pub fn push(&mut self, message: AdapterMessage) -> bool {
        let critical = message.is_critical();
        if self.messages.len() < self.capacity {
            self.messages.push_back((message, critical));
            return true;
        }

        if let Some(index) = self
            .messages
            .iter()
            .position(|(_, is_critical)| !*is_critical)
        {
            if critical {
                self.messages.remove(index);
                self.messages.push_back((message, critical));
                true
            } else {
                false
            }
        } else {
            false
        }
    }

    pub fn pop(&mut self) -> Option<AdapterMessage> {
        self.messages.pop_front().map(|(message, _)| message)
    }

    pub fn len(&self) -> usize {
        self.messages.len()
    }

    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }
}

impl AdapterMessage {
    pub fn is_critical(&self) -> bool {
        matches!(
            self,
            Self::Event {
                event: ContextEvent {
                    event_type:
                        ariadne_core::ContextEventType::ThreadStarted
                        | ariadne_core::ContextEventType::ThreadStopped
                        | ariadne_core::ContextEventType::ThreadResumed
                        | ariadne_core::ContextEventType::CheckpointCreated
                        | ariadne_core::ContextEventType::CheckpointUpdated
                        | ariadne_core::ContextEventType::CheckpointCleared
                        | ariadne_core::ContextEventType::ExplicitReference,
                    ..
                },
                ..
            } | Self::AttachReference { .. }
        )
    }

    fn source(&self) -> Option<&str> {
        match self {
            Self::Event { source, .. } | Self::AttachReference { source, .. } => Some(source),
            Self::Hello(_) | Self::Ping { .. } => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AdapterSession {
    hello: AdapterHello,
}

impl AdapterSession {
    pub fn establish(hello: AdapterHello) -> Result<Self, ProtocolError> {
        validate_message(&AdapterMessage::Hello(hello.clone()))?;
        if hello
            .capabilities
            .iter()
            .any(|capability| capability.trim().is_empty())
        {
            return Err(ProtocolError::Invalid("empty capability".into()));
        }
        Ok(Self { hello })
    }

    pub fn adapter_id(&self) -> &str {
        &self.hello.adapter_id
    }

    pub fn accepts(&self, message: &AdapterMessage) -> Result<(), ProtocolError> {
        validate_message(message)?;
        if let Some(source) = message.source() {
            if source != self.adapter_id() {
                return Err(ProtocolError::SourceMismatch);
            }
        }
        if matches!(message, AdapterMessage::AttachReference { .. })
            && !self
                .hello
                .capabilities
                .iter()
                .any(|capability| capability == "attach_reference")
        {
            return Err(ProtocolError::CapabilityViolation);
        }
        Ok(())
    }
}

pub fn encode(message: &AdapterMessage) -> Result<Vec<u8>, ProtocolError> {
    let bytes =
        serde_json::to_vec(message).map_err(|error| ProtocolError::Invalid(error.to_string()))?;
    validate_bytes(&bytes)?;
    validate_message(message)?;
    Ok(bytes)
}

pub fn decode(bytes: &[u8]) -> Result<AdapterMessage, ProtocolError> {
    validate_bytes(bytes)?;
    let message: AdapterMessage =
        serde_json::from_slice(bytes).map_err(|error| ProtocolError::Invalid(error.to_string()))?;
    validate_message(&message)?;
    Ok(message)
}

pub fn encode_frame(message: &AdapterMessage) -> Result<Vec<u8>, ProtocolError> {
    let payload = encode(message)?;
    let length = u32::try_from(payload.len()).map_err(|_| ProtocolError::TooLarge)?;
    let mut frame = Vec::with_capacity(FRAME_HEADER_BYTES + payload.len());
    frame.extend_from_slice(&length.to_le_bytes());
    frame.extend_from_slice(&payload);
    Ok(frame)
}

pub fn decode_frame(frame: &[u8]) -> Result<AdapterMessage, ProtocolError> {
    if frame.len() < FRAME_HEADER_BYTES {
        return Err(ProtocolError::InvalidFrame);
    }
    let mut header = [0; FRAME_HEADER_BYTES];
    header.copy_from_slice(&frame[..FRAME_HEADER_BYTES]);
    let length = u32::from_le_bytes(header) as usize;
    if length > MAX_MESSAGE_BYTES || length != frame.len() - FRAME_HEADER_BYTES {
        return Err(ProtocolError::InvalidFrame);
    }
    decode(&frame[FRAME_HEADER_BYTES..])
}

fn validate_bytes(bytes: &[u8]) -> Result<(), ProtocolError> {
    if bytes.len() > MAX_MESSAGE_BYTES {
        Err(ProtocolError::TooLarge)
    } else {
        Ok(())
    }
}

fn validate_message(message: &AdapterMessage) -> Result<(), ProtocolError> {
    let version = match message {
        AdapterMessage::Hello(hello) => {
            if hello.adapter_id.trim().is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            hello.protocol_version
        }
        AdapterMessage::Event {
            protocol_version,
            source,
            event,
        } => {
            if source.trim().is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            if source != event.source {
                return Err(ProtocolError::SourceMismatch);
            }
            *protocol_version
        }
        AdapterMessage::Ping { protocol_version } => *protocol_version,
        AdapterMessage::AttachReference {
            protocol_version,
            source,
            ..
        } => {
            if source.trim().is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            *protocol_version
        }
    };

    if version != PROTOCOL_VERSION {
        return Err(ProtocolError::UnsupportedVersion(version));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ariadne_core::{ContextEventType, ContextEvent};

    fn event(source: &str, event_type: ContextEventType) -> ContextEvent {
        ContextEvent {
            id: "event-1".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
            event_type,
            application: None,
            artifact: None,
            workspace: None,
            location: None,
            source: source.into(),
            private_browsing: false,
        }
    }

    #[test]
    fn protocol_round_trip_and_version_validation() {
        let message = AdapterMessage::Event {
            protocol_version: 1,
            source: "vscode".into(),
            event: event("vscode", ContextEventType::FileFocused),
        };
        let encoded = encode(&message).unwrap();
        assert_eq!(decode(&encoded).unwrap(), message);

        let invalid = AdapterMessage::Ping { protocol_version: 2 };
        assert!(matches!(
            encode(&invalid),
            Err(ProtocolError::UnsupportedVersion(2))
        ));
    }

    #[test]
    fn bounded_queue_preserves_critical_actions() {
        let mut queue = BoundedMessageQueue::new(2);
        assert!(queue.push(AdapterMessage::Ping { protocol_version: 1 }));
        assert!(queue.push(AdapterMessage::Ping { protocol_version: 1 }));
        assert!(queue.push(AdapterMessage::Event {
            protocol_version: 1,
            source: "test".into(),
            event: event("test", ContextEventType::ThreadStopped),
        }));
        assert_eq!(queue.len(), 2);
    }

    #[test]
    fn session_rejects_spoofed_source_and_frame_round_trips() {
        let session = AdapterSession::establish(AdapterHello {
            protocol_version: 1,
            adapter_id: "vscode".into(),
            adapter_version: "1.0.0".into(),
            capabilities: vec!["events".into()],
        })
        .unwrap();
        let message = AdapterMessage::Event {
            protocol_version: 1,
            source: "other".into(),
            event: event("other", ContextEventType::FileFocused),
        };
        assert!(matches!(
            session.accepts(&message),
            Err(ProtocolError::SourceMismatch)
        ));

        let valid = AdapterMessage::Ping { protocol_version: 1 };
        assert_eq!(
            decode_frame(&encode_frame(&valid).unwrap()).unwrap(),
            valid
        );
    }
}
