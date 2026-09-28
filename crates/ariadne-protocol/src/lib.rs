//! Versioned local adapter protocol.
//! Transport is intentionally separate from message validation so named
//! pipes, Unix sockets, and Android bridges can reuse the same contract.

use ariadne_core::ContextEvent;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{self, Read, Write};
use std::path::Path;
#[cfg(unix)]
use std::path::PathBuf;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_MESSAGE_BYTES: usize = 128 * 1024;
pub const DEFAULT_QUEUE_CAPACITY: usize = 256;
pub const FRAME_HEADER_BYTES: usize = 4;

/// A blocking local-only transport. The OS endpoint is deliberately selected
/// by this crate: Unix uses a filesystem Unix socket and Windows uses a named
/// pipe. No TCP listener is ever created.
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("transport I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    #[error("transport endpoint is invalid")]
    InvalidEndpoint,
}

#[cfg(unix)]
mod local_transport {
    use super::*;
    use std::os::unix::net::{UnixListener, UnixStream};

    pub struct LocalListener {
        path: PathBuf,
        listener: UnixListener,
    }

    pub struct LocalStream(UnixStream);

    impl LocalListener {
        pub fn bind(path: impl AsRef<Path>) -> Result<Self, TransportError> {
            let path = path.as_ref().to_path_buf();
            if path.as_os_str().is_empty() {
                return Err(TransportError::InvalidEndpoint);
            }
            let _ = std::fs::remove_file(&path);
            let listener = UnixListener::bind(&path)?;
            Ok(Self { path, listener })
        }

        pub fn accept(&self) -> Result<LocalStream, TransportError> {
            Ok(LocalStream(self.listener.accept()?.0))
        }
    }

    impl Drop for LocalListener {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
        }
    }

    impl LocalStream {
        pub fn connect(path: impl AsRef<Path>) -> Result<Self, TransportError> {
            Ok(Self(UnixStream::connect(path)?))
        }

        pub fn send(&mut self, message: &AdapterMessage) -> Result<(), TransportError> {
            let frame = encode_frame(message)?;
            self.0.write_all(&frame)?;
            self.0.flush()?;
            Ok(())
        }

        pub fn receive(&mut self) -> Result<AdapterMessage, TransportError> {
            let mut header = [0u8; FRAME_HEADER_BYTES];
            self.0.read_exact(&mut header)?;
            let length = u32::from_le_bytes(header) as usize;
            if length > MAX_MESSAGE_BYTES {
                return Err(ProtocolError::TooLarge.into());
            }
            let mut payload = vec![0u8; length];
            self.0.read_exact(&mut payload)?;
            decode(&payload).map_err(TransportError::from)
        }
    }
}

#[cfg(windows)]
mod local_transport {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_PIPE_CONNECTED, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING, PIPE_ACCESS_DUPLEX,
    };
    use windows_sys::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
    };

    const PIPE_PREFIX: &str = "\\\\.\\pipe\\";

    fn wide(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }

    fn endpoint(name: &str) -> Result<Vec<u16>, TransportError> {
        if name.trim().is_empty() || name.contains(['\\', '/']) {
            return Err(TransportError::InvalidEndpoint);
        }
        Ok(wide(OsStr::new(&format!("{PIPE_PREFIX}{name}"))))
    }

    struct Handle(HANDLE);

    impl Drop for Handle {
        fn drop(&mut self) {
            if self.0 != INVALID_HANDLE_VALUE && !self.0.is_null() {
                unsafe { CloseHandle(self.0) };
            }
        }
    }

    pub struct LocalListener {
        name: String,
    }

    pub struct LocalStream(Handle);

    impl LocalListener {
        pub fn bind(name: impl AsRef<Path>) -> Result<Self, TransportError> {
            let name = name.as_ref().to_string_lossy().into_owned();
            if name.trim().is_empty() || name.contains(['\\', '/']) {
                return Err(TransportError::InvalidEndpoint);
            }
            Ok(Self { name })
        }

        pub fn accept(&self) -> Result<LocalStream, TransportError> {
            let name = endpoint(&self.name)?;
            let handle = unsafe {
                CreateNamedPipeW(
                    name.as_ptr(),
                    PIPE_ACCESS_DUPLEX,
                    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                    1,
                    (MAX_MESSAGE_BYTES + FRAME_HEADER_BYTES) as u32,
                    (MAX_MESSAGE_BYTES + FRAME_HEADER_BYTES) as u32,
                    0,
                    std::ptr::null(),
                )
            };
            if handle == INVALID_HANDLE_VALUE || handle.is_null() {
                return Err(io::Error::last_os_error().into());
            }
            let connected = unsafe { ConnectNamedPipe(handle, std::ptr::null_mut()) };
            if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                return Err(io::Error::last_os_error().into());
            }
            Ok(LocalStream(Handle(handle)))
        }
    }

    impl LocalStream {
        pub fn connect(name: impl AsRef<Path>) -> Result<Self, TransportError> {
            let endpoint = endpoint(&name.as_ref().to_string_lossy())?;
            let handle = unsafe {
                CreateFileW(
                    endpoint.as_ptr(),
                    FILE_GENERIC_READ | FILE_GENERIC_WRITE,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    std::ptr::null_mut(),
                )
            };
            if handle == INVALID_HANDLE_VALUE || handle.is_null() {
                return Err(io::Error::last_os_error().into());
            }
            Ok(Self(Handle(handle)))
        }

        fn write_all(&self, bytes: &[u8]) -> Result<(), TransportError> {
            let mut offset = 0;
            while offset < bytes.len() {
                let remaining = &bytes[offset..];
                let mut written = 0;
                let ok = unsafe {
                    windows_sys::Win32::Storage::FileSystem::WriteFile(
                        self.0 .0,
                        remaining.as_ptr(),
                        remaining.len() as u32,
                        &mut written,
                        std::ptr::null_mut(),
                    )
                };
                if ok == 0 || written == 0 {
                    return Err(io::Error::last_os_error().into());
                }
                offset += written as usize;
            }
            Ok(())
        }

        fn read_exact(&self, bytes: &mut [u8]) -> Result<(), TransportError> {
            let mut offset = 0;
            while offset < bytes.len() {
                let mut read = 0;
                let ok = unsafe {
                    windows_sys::Win32::Storage::FileSystem::ReadFile(
                        self.0 .0,
                        bytes[offset..].as_mut_ptr(),
                        (bytes.len() - offset) as u32,
                        &mut read,
                        std::ptr::null_mut(),
                    )
                };
                if ok == 0 || read == 0 {
                    return Err(io::Error::last_os_error().into());
                }
                offset += read as usize;
            }
            Ok(())
        }

        pub fn send(&mut self, message: &AdapterMessage) -> Result<(), TransportError> {
            self.write_all(&encode_frame(message)?)
        }

        pub fn receive(&mut self) -> Result<AdapterMessage, TransportError> {
            let mut header = [0u8; FRAME_HEADER_BYTES];
            self.read_exact(&mut header)?;
            let length = u32::from_le_bytes(header) as usize;
            if length > MAX_MESSAGE_BYTES {
                return Err(ProtocolError::TooLarge.into());
            }
            let mut payload = vec![0u8; length];
            self.read_exact(&mut payload)?;
            decode(&payload).map_err(TransportError::from)
        }
    }
}

pub use local_transport::{LocalListener, LocalStream};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdapterHello {
    pub protocol_version: u32,
    pub adapter_id: String,
    pub adapter_version: String,
    pub capabilities: Vec<String>,
    /// A per-installation capability token read from the local endpoint
    /// descriptor. The OS-local endpoint and this token are both required.
    pub authorization_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AdapterMessage {
    Hello(AdapterHello),
    Welcome {
        protocol_version: u32,
        adapter_id: String,
    },
    Event {
        protocol_version: u32,
        source: String,
        event: Box<ContextEvent>,
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
        match self {
            Self::Event { event, .. } => matches!(
                &event.event_type,
                ariadne_core::ContextEventType::ThreadStarted
                    | ariadne_core::ContextEventType::ThreadStopped
                    | ariadne_core::ContextEventType::ThreadResumed
                    | ariadne_core::ContextEventType::CheckpointCreated
                    | ariadne_core::ContextEventType::CheckpointUpdated
                    | ariadne_core::ContextEventType::CheckpointCleared
                    | ariadne_core::ContextEventType::ExplicitReference
            ),
            Self::AttachReference { .. } => true,
            _ => false,
        }
    }

    fn source(&self) -> Option<&str> {
        match self {
            Self::Event { source, .. } | Self::AttachReference { source, .. } => Some(source),
            Self::Hello(_) | Self::Welcome { .. } | Self::Ping { .. } => None,
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

    pub fn establish_authenticated(
        hello: AdapterHello,
        expected_token: &str,
    ) -> Result<Self, ProtocolError> {
        let session = Self::establish(hello)?;
        if expected_token.is_empty() || session.hello.authorization_token != expected_token {
            return Err(ProtocolError::MissingIdentity);
        }
        Ok(session)
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
            if hello.adapter_version.trim().is_empty() || hello.authorization_token.is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            hello.protocol_version
        }
        AdapterMessage::Welcome {
            protocol_version,
            adapter_id,
        } => {
            if adapter_id.trim().is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            *protocol_version
        }
        AdapterMessage::Event {
            protocol_version,
            source,
            event,
        } => {
            if source.trim().is_empty() {
                return Err(ProtocolError::MissingIdentity);
            }
            if source.as_str() != event.source {
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
    use ariadne_core::{ContextEvent, ContextEventType};

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
            event: Box::new(event("vscode", ContextEventType::FileFocused)),
        };
        let encoded = encode(&message).unwrap();
        assert_eq!(decode(&encoded).unwrap(), message);

        let invalid = AdapterMessage::Ping {
            protocol_version: 2,
        };
        assert!(matches!(
            encode(&invalid),
            Err(ProtocolError::UnsupportedVersion(2))
        ));
    }

    #[test]
    fn bounded_queue_preserves_critical_actions() {
        let mut queue = BoundedMessageQueue::new(2);
        assert!(queue.push(AdapterMessage::Ping {
            protocol_version: 1
        }));
        assert!(queue.push(AdapterMessage::Ping {
            protocol_version: 1
        }));
        assert!(queue.push(AdapterMessage::Event {
            protocol_version: 1,
            source: "test".into(),
            event: Box::new(event("test", ContextEventType::ThreadStopped)),
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
            authorization_token: "token".into(),
        })
        .unwrap();
        let message = AdapterMessage::Event {
            protocol_version: 1,
            source: "other".into(),
            event: Box::new(event("other", ContextEventType::FileFocused)),
        };
        assert!(matches!(
            session.accepts(&message),
            Err(ProtocolError::SourceMismatch)
        ));

        let valid = AdapterMessage::Ping {
            protocol_version: 1,
        };
        assert_eq!(decode_frame(&encode_frame(&valid).unwrap()).unwrap(), valid);
    }

    #[test]
    fn rejects_oversized_and_malformed_frames() {
        assert!(matches!(
            decode(&vec![0; MAX_MESSAGE_BYTES + 1]),
            Err(ProtocolError::TooLarge)
        ));
        assert!(matches!(
            decode_frame(&[1, 0, 0]),
            Err(ProtocolError::InvalidFrame)
        ));
    }
}
