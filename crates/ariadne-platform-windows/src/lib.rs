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
    pub window_title: Option<String>,
}

#[cfg(windows)]
pub fn observe_foreground() -> Result<Option<ForegroundObservation>, SensorError> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId};

    // SAFETY: these are read-only Windows APIs and the returned handles are
    // closed on every successful process-open path.
    let window = unsafe { GetForegroundWindow() };
    if window == 0 { return Ok(None); }
    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(window, &mut process_id); }
    if process_id == 0 { return Err(SensorError::Api); }
    let process = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, process_id) };
    if process == 0 { return Err(SensorError::Api); }
    let mut path = [0u16; 1024];
    let path_len = unsafe { GetModuleFileNameExW(process, 0, path.as_mut_ptr(), path.len() as u32) };
    unsafe { CloseHandle(process); }
    if path_len == 0 { return Err(SensorError::Api); }
    let executable = OsString::from_wide(&path[..path_len as usize]).to_string_lossy().into_owned();
    let identity = executable.clone();
    let title_len = unsafe { GetWindowTextLengthW(window) };
    let window_title = if title_len > 0 {
        let mut title = vec![0u16; title_len as usize + 1];
        let length = unsafe { GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32) };
        Some(String::from_utf16_lossy(&title[..length as usize]))
    } else { None };
    let display_name = executable.rsplit(['\\', '/']).next().unwrap_or(&executable).to_owned();
    Ok(Some(ForegroundObservation { application_identity: identity, display_name, window_title }))
}

#[cfg(not(windows))]
pub fn observe_foreground() -> Result<Option<ForegroundObservation>, SensorError> {
    Err(SensorError::Unsupported)
}
