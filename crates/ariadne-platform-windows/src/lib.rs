//! Windows foreground sensor.
//!
//! This adapter reports only foreground-window metadata and leaves canonical
//! event handling to Ariadne Core. It intentionally does not scrape controls,
//! read window contents, capture keystrokes, or take screenshots.

#[derive(Debug, thiserror::Error)]
pub enum SensorError {
    #[error("foreground sensor is unsupported on this operating system")]
    Unsupported,
    #[error("Windows API call failed")]
    Api,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForegroundObservation {
    pub application_identity: String,
    pub display_name: String,
    /// Reserved for a future, explicitly governed title policy. The current
    /// sensor never reads a window title because the desktop does not use it.
    pub window_title: Option<String>,
}

#[cfg(windows)]
pub fn observe_foreground() -> Result<Option<ForegroundObservation>, SensorError> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    // SAFETY: these are read-only Windows APIs and the returned handles are
    // closed on every successful process-open path.
    let window = unsafe { GetForegroundWindow() };
    if window.is_null() {
        return Ok(None);
    }
    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(window, &mut process_id);
    }
    if process_id == 0 {
        return Err(SensorError::Api);
    }
    // QueryFullProcessImageNameW with PROCESS_QUERY_LIMITED_INFORMATION is
    // sufficient for identity and avoids requesting VM_READ access.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if process.is_null() {
        return Err(SensorError::Api);
    }
    let mut path = [0u16; 1024];
    let mut path_len = path.len() as u32;
    let succeeded =
        unsafe { QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut path_len) };
    unsafe {
        CloseHandle(process);
    }
    if succeeded == 0 || path_len == 0 {
        return Err(SensorError::Api);
    }
    let executable = OsString::from_wide(&path[..path_len as usize])
        .to_string_lossy()
        .into_owned();
    let identity = executable.clone();
    let display_name = executable
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(&executable)
        .to_owned();
    Ok(Some(ForegroundObservation {
        application_identity: identity,
        display_name,
        window_title: None,
    }))
}

#[cfg(not(windows))]
pub fn observe_foreground() -> Result<Option<ForegroundObservation>, SensorError> {
    Err(SensorError::Unsupported)
}
