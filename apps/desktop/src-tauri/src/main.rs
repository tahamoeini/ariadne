use ariadne_core::{CapturePolicy, CoreEngine, RollingContext};
use ariadne_protocol::{
    AdapterMessage, AdapterSession, LocalListener, LocalStream, PROTOCOL_VERSION,
};
use ariadne_storage::{import_legacy_investigation_json, Store};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::menu::MenuBuilder;
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, State};

struct PersistenceCursor {
    generation: i64,
    revisions: HashMap<String, i64>,
}

struct AppState {
    engine: Mutex<CoreEngine>,
    store: Mutex<Store>,
    cursor: Mutex<PersistenceCursor>,
    persistence_error: Mutex<Option<String>>,
    sensor_state: Mutex<String>,
    adapter_state: Mutex<String>,
}

#[derive(Debug, Serialize)]
struct Status {
    capture_state: String,
    active_thread: Option<ariadne_core::Thread>,
    persistence_state: String,
    sensor_state: String,
    adapter_state: String,
    thread_count: usize,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Serialize)]
struct IpcDescriptor {
    protocol_version: u32,
    endpoint: String,
    authorization_token: String,
}

fn ipc_endpoint(data_dir: &Path) -> String {
    if cfg!(windows) {
        "ariadne-v1".into()
    } else {
        data_dir.join("ariadne.sock").to_string_lossy().into_owned()
    }
}

fn load_or_create_ipc_token(data_dir: &Path) -> Result<String, String> {
    let path = data_dir.join("ipc-token");
    if let Ok(value) = fs::read_to_string(&path) {
        let value = value.trim().to_owned();
        if !value.is_empty() {
            return Ok(value);
        }
    }
    let token = uuid::Uuid::new_v4().to_string();
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(&path) {
        Ok(mut file) => {
            file.write_all(token.as_bytes())
                .map_err(|error| error.to_string())?;
            Ok(token)
        }
        Err(_) => fs::read_to_string(&path)
            .map(|value| value.trim().to_owned())
            .map_err(|error| error.to_string()),
    }
}

fn write_ipc_descriptor(data_dir: &Path, token: &str) -> Result<String, String> {
    let endpoint = ipc_endpoint(data_dir);
    let descriptor = serde_json::to_vec(&IpcDescriptor {
        protocol_version: PROTOCOL_VERSION,
        endpoint: endpoint.clone(),
        authorization_token: token.to_owned(),
    })
    .map_err(|error| error.to_string())?;
    let path = data_dir.join("ipc.json");
    let temporary = data_dir.join("ipc.json.tmp");
    fs::write(&temporary, descriptor).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())?;
    Ok(endpoint)
}

fn import_legacy_directory(store: &mut Store, data_dir: &Path) -> Result<(), String> {
    let directory = data_dir.join("legacy");
    if !directory.exists() {
        return Ok(());
    }
    let generation = store.generation().map_err(|error| error.to_string())?;
    let mut files = fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
    files.sort();
    for path in files {
        let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        import_legacy_investigation_json(store, &contents, generation)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn notify_state(app: &tauri::AppHandle) {
    let _ = app.emit("ariadne-state-changed", ());
}

fn append_log(app: &tauri::AppHandle, message: &str) {
    let Ok(data_dir) = app.path().app_local_data_dir() else {
        return;
    };
    let _ = fs::create_dir_all(&data_dir);
    let line = format!("{} {}\n", now(), message);
    let path = data_dir.join("ariadne.log");
    if fs::metadata(&path)
        .map(|metadata| metadata.len() > 256 * 1024)
        .unwrap_or(false)
    {
        let _ = fs::rename(&path, data_dir.join("ariadne.log.1"));
    }
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| file.write_all(line.as_bytes()));
}

fn persist_thread(state: &AppState, thread: &ariadne_core::Thread) -> Result<(), String> {
    let mut cursor = state
        .cursor
        .lock()
        .map_err(|_| "persistence cursor lock poisoned")?;
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let expected = cursor.revisions.get(&thread.id).copied();
    let stored = store
        .save_thread(thread, expected, cursor.generation)
        .map_err(|error| error.to_string())?;
    cursor.revisions.insert(thread.id.clone(), stored.revision);
    Ok(())
}

fn record_persistence(state: &AppState, result: Result<(), String>) -> Result<(), String> {
    let mut error_state = state
        .persistence_error
        .lock()
        .map_err(|_| "status lock poisoned")?;
    match result {
        Ok(()) => {
            *error_state = None;
            Ok(())
        }
        Err(error) => {
            *error_state = Some(error.clone());
            Err(error)
        }
    }
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> Result<Status, String> {
    let engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let persistence_state = state
        .persistence_error
        .lock()
        .map_err(|_| "status lock poisoned")?
        .clone()
        .unwrap_or_else(|| "available".into());
    let sensor_state = state
        .sensor_state
        .lock()
        .map_err(|_| "sensor state lock poisoned")?
        .clone();
    let adapter_state = state
        .adapter_state
        .lock()
        .map_err(|_| "adapter state lock poisoned")?
        .clone();

    let capture_state = match engine.policy.pause_state(&now()) {
        ariadne_core::PauseState::Running => "running",
        ariadne_core::PauseState::Timed { .. } => "paused_until",
        ariadne_core::PauseState::Manual => "paused",
    };

    Ok(Status {
        capture_state: capture_state.into(),
        active_thread: engine.active_thread().cloned(),
        persistence_state,
        sensor_state,
        adapter_state,
        thread_count: store
            .list_threads()
            .map_err(|error| error.to_string())?
            .len(),
    })
}

#[tauri::command]
fn get_capture_policy(state: State<'_, AppState>) -> Result<CapturePolicy, String> {
    state
        .engine
        .lock()
        .map_err(|_| "core lock poisoned".into())
        .map(|engine| engine.policy.clone())
}

#[tauri::command]
fn get_data_location(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_threads(state: State<'_, AppState>) -> Result<Vec<ariadne_core::Thread>, String> {
    state
        .store
        .lock()
        .map_err(|_| "storage lock poisoned")?
        .list_threads()
        .map(|items| items.into_iter().map(|(thread, _)| thread).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_thread(
    name: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ariadne_core::Thread, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let thread = engine
        .start_thread(name, now())
        .map_err(|error| error.to_string())?
        .clone();

    if let Err(error) = record_persistence(&state, persist_thread(&state, &thread)) {
        engine.delete_thread(&thread.id);
        return Err(error);
    }

    notify_state(&app);
    Ok(thread)
}

#[tauri::command]
fn save_recent_context(
    name: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ariadne_core::Thread, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let thread = engine
        .save_recent_as_thread(name, now())
        .map_err(|error| error.to_string())?
        .clone();

    if let Err(error) = record_persistence(&state, persist_thread(&state, &thread)) {
        engine.delete_thread(&thread.id);
        return Err(error);
    }

    notify_state(&app);
    Ok(thread)
}

#[tauri::command]
fn stop_thread(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ariadne_core::Thread, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous = engine.active_thread().cloned();
    let previous_active_id = engine.active_thread_id().map(str::to_owned);
    let thread = engine
        .stop_thread(now())
        .map_err(|error| error.to_string())?;

    if let Err(error) = record_persistence(&state, persist_thread(&state, &thread)) {
        if let Some(previous) = previous {
            engine.restore_thread_state(previous, previous_active_id);
        }
        return Err(error);
    }

    notify_state(&app);
    Ok(thread)
}

#[tauri::command]
fn resume_thread(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ariadne_core::ResumePlan, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous = engine.thread(&id).cloned();
    let previous_active_id = engine.active_thread_id().map(str::to_owned);
    let plan = engine
        .resume_thread(&id, now())
        .map_err(|error| error.to_string())?;

    if let Some(thread) = engine.thread(&id).cloned() {
        if let Err(error) = record_persistence(&state, persist_thread(&state, &thread)) {
            if let Some(previous) = previous {
                engine.restore_thread_state(previous, previous_active_id);
            }
            return Err(error);
        }
    }

    notify_state(&app);
    Ok(plan)
}

#[tauri::command]
fn set_capture_paused(
    paused: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous_policy = engine.policy.clone();
    engine.policy.set_manual_pause(paused);
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let result = store
        .save_capture_policy(&engine.policy)
        .map_err(|error| error.to_string());
    let result = record_persistence(&state, result);
    if result.is_err() {
        engine.policy = previous_policy;
    }
    if result.is_ok() {
        notify_state(&app);
    }
    result
}

#[tauri::command]
fn set_timed_pause(
    minutes: u64,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if minutes == 0 {
        return Err("pause duration must be greater than zero".into());
    }

    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous_policy = engine.policy.clone();
    let until = chrono::Utc::now() + chrono::Duration::minutes(minutes as i64);
    engine.policy.set_timed_pause(Some(
        until.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    ));
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let result = store
        .save_capture_policy(&engine.policy)
        .map_err(|error| error.to_string());
    let result = record_persistence(&state, result);
    if result.is_err() {
        engine.policy = previous_policy;
    }
    if result.is_ok() {
        notify_state(&app);
    }
    result
}

#[tauri::command]
fn set_capture_exclusions(
    applications: Vec<String>,
    domains: Vec<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous_policy = engine.policy.clone();
    engine.policy.excluded_applications = applications
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .take(100)
        .collect();
    engine.policy.excluded_browser_domains = domains
        .into_iter()
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty() && !value.contains(['/', '?', '#']))
        .take(100)
        .collect();
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let result = store
        .save_capture_policy(&engine.policy)
        .map_err(|error| error.to_string());
    let result = record_persistence(&state, result);
    if result.is_err() {
        engine.policy = previous_policy;
    } else {
        notify_state(&app);
    }
    result
}

#[tauri::command]
fn set_checkpoint(
    text: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    engine
        .set_checkpoint(text, now())
        .map_err(|error| error.to_string())?;
    let thread = engine
        .active_thread()
        .cloned()
        .ok_or_else(|| "no active Thread".to_owned())?;

    let result = record_persistence(&state, persist_thread(&state, &thread));
    if result.is_ok() {
        notify_state(&app);
    }
    result
}

#[tauri::command]
fn delete_thread(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let mut cursor = state
        .cursor
        .lock()
        .map_err(|_| "persistence cursor lock poisoned")?;
    let deleted = state
        .store
        .lock()
        .map_err(|_| "storage lock poisoned")?
        .delete_thread(&id, &now())
        .map_err(|error| error.to_string())?;

    if deleted {
        engine.delete_thread(&id);
        cursor.revisions.remove(&id);
        notify_state(&app);
    }

    Ok(deleted)
}

#[tauri::command]
fn delete_all_data(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<i64, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let mut cursor = state
        .cursor
        .lock()
        .map_err(|_| "persistence cursor lock poisoned")?;
    let count = state
        .store
        .lock()
        .map_err(|_| "storage lock poisoned")?
        .delete_all(&now())
        .map_err(|error| error.to_string())?;

    engine.clear_threads();

    cursor.generation += 1;
    cursor.revisions.clear();
    notify_state(&app);
    Ok(count)
}

#[tauri::command]
fn open_logs(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("ariadne.log");
    if !path.exists() {
        fs::write(&path, format!("{} startup\n", now())).map_err(|error| error.to_string())?;
    }
    #[cfg(windows)]
    std::process::Command::new("explorer")
        .arg(path.parent().ok_or("invalid log path")?)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(path.parent().ok_or("invalid log path")?)
        .spawn()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(path.parent().ok_or("invalid log path")?)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_start_at_login(enabled: bool) -> Result<(), String> {
    set_start_at_login_impl(enabled)
}

#[cfg(windows)]
fn set_start_at_login_impl(enabled: bool) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    let key_name: Vec<u16> =
        std::ffi::OsStr::new("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
    let value_name: Vec<u16> = std::ffi::OsStr::new("Ariadne")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut key = std::ptr::null_mut();
    let result = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            key_name.as_ptr(),
            0,
            std::ptr::null_mut(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut key,
            std::ptr::null_mut(),
        )
    };
    if result != 0 {
        return Err(format!("Windows registry error {result}"));
    }
    let result = if enabled {
        let value = std::env::current_exe().map_err(|error| error.to_string())?;
        let value: Vec<u16> = value
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            RegSetValueExW(
                key,
                value_name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            )
        }
    } else {
        unsafe { RegDeleteValueW(key, value_name.as_ptr()) }
    };
    unsafe { RegCloseKey(key) };
    if result == 0 {
        Ok(())
    } else {
        Err(format!("Windows registry error {result}"))
    }
}

#[cfg(not(windows))]
fn set_start_at_login_impl(_enabled: bool) -> Result<(), String> {
    Err("start at login is only implemented for Windows in this MVP".into())
}

fn open_resume_resource(reference: &str) -> Result<(), String> {
    let is_url = reference.starts_with("http://") || reference.starts_with("https://");
    if !is_url && !Path::new(reference).is_absolute() {
        return Err("resume resource must be an absolute path or sanitized HTTP(S) URL".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", reference])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(reference)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(reference)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn execute_resume_actions(id: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let plan = engine
        .resume_plan(&id)
        .ok_or_else(|| "Thread not found".to_owned())?;
    let resources = plan
        .primary_artifact
        .into_iter()
        .chain(plan.supporting_artifacts)
        .take(1 + ariadne_core::MAX_SUPPORTING_ARTIFACTS)
        .filter_map(|artifact| {
            matches!(
                artifact.kind,
                ariadne_core::ArtifactKind::File
                    | ariadne_core::ArtifactKind::Folder
                    | ariadne_core::ArtifactKind::Workspace
                    | ariadne_core::ArtifactKind::Repository
                    | ariadne_core::ArtifactKind::Document
                    | ariadne_core::ArtifactKind::Pdf
                    | ariadne_core::ArtifactKind::WebPage
            )
            .then_some(artifact.safe_reference)
        });
    let mut opened = Vec::new();
    for resource in resources {
        if open_resume_resource(&resource).is_ok() {
            opened.push(resource);
        }
    }
    Ok(opened)
}

fn handle_adapter_connection(
    app: &tauri::AppHandle,
    mut stream: LocalStream,
    expected_token: &str,
) -> Result<(), String> {
    let hello = stream.receive().map_err(|error| error.to_string())?;
    let AdapterMessage::Hello(hello) = hello else {
        return Err("adapter must begin with hello".into());
    };
    let session = AdapterSession::establish_authenticated(hello, expected_token)
        .map_err(|error| error.to_string())?;
    stream
        .send(&AdapterMessage::Welcome {
            protocol_version: PROTOCOL_VERSION,
            adapter_id: session.adapter_id().to_owned(),
        })
        .map_err(|error| error.to_string())?;

    loop {
        let message = stream.receive().map_err(|error| error.to_string())?;
        session
            .accepts(&message)
            .map_err(|error| error.to_string())?;
        match message {
            AdapterMessage::Event { event, .. } => {
                let state = app.state::<AppState>();
                let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
                if engine.record(*event, &now()) {
                    if let Some(active) = engine.active_thread().cloned() {
                        record_persistence(&state, persist_thread(&state, &active))?;
                    }
                    notify_state(app);
                }
            }
            AdapterMessage::AttachReference {
                source, url, title, ..
            } => {
                let state = app.state::<AppState>();
                let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
                if engine
                    .attach_reference(source, url, title, now())
                    .map_err(|error| error.to_string())?
                {
                    if let Some(active) = engine.active_thread().cloned() {
                        record_persistence(&state, persist_thread(&state, &active))?;
                    }
                    notify_state(app);
                }
            }
            AdapterMessage::Ping { .. } => {
                stream
                    .send(&AdapterMessage::Ping {
                        protocol_version: PROTOCOL_VERSION,
                    })
                    .map_err(|error| error.to_string())?;
            }
            AdapterMessage::Hello(_) | AdapterMessage::Welcome { .. } => {
                return Err("unexpected protocol message".into());
            }
        }
    }
}

fn start_ipc_server(app: tauri::AppHandle, endpoint: String, token: String) {
    std::thread::spawn(move || {
        let listener = match LocalListener::bind(&endpoint) {
            Ok(listener) => listener,
            Err(error) => {
                append_log(&app, "local adapter listener failed");
                if let Ok(mut adapter_state) = app.state::<AppState>().adapter_state.lock() {
                    *adapter_state = format!("degraded: {error}");
                }
                notify_state(&app);
                return;
            }
        };
        while let Ok(stream) = listener.accept() {
            append_log(&app, "local adapter connected");
            if let Ok(mut adapter_state) = app.state::<AppState>().adapter_state.lock() {
                *adapter_state = "connected".into();
            }
            notify_state(&app);
            let _ = handle_adapter_connection(&app, stream, &token);
            append_log(&app, "local adapter disconnected");
            if let Ok(mut adapter_state) = app.state::<AppState>().adapter_state.lock() {
                *adapter_state = "disconnected".into();
            }
            notify_state(&app);
        }
    });
}

#[cfg(windows)]
fn start_foreground_sensor(app: tauri::AppHandle) {
    use ariadne_core::{
        ApplicationContext, ArtifactKind, ArtifactRef, ContextEvent, ContextEventType,
    };
    use ariadne_platform_windows::observe_foreground;
    use std::time::Duration;

    std::thread::spawn(move || {
        let mut previous: Option<ariadne_platform_windows::ForegroundObservation> = None;
        loop {
            match observe_foreground() {
                Err(_) => {
                    if let Ok(mut sensor_state) = app.state::<AppState>().sensor_state.lock() {
                        *sensor_state = "degraded".into();
                    }
                    notify_state(&app);
                }
                Ok(Some(observation)) => {
                    if let Ok(mut sensor_state) = app.state::<AppState>().sensor_state.lock() {
                        *sensor_state = "running".into();
                    }
                    if previous.as_ref() != Some(&observation) {
                        let event = ContextEvent {
                            id: uuid::Uuid::new_v4().to_string(),
                            timestamp: now(),
                            event_type: ContextEventType::ApplicationFocused,
                            application: Some(ApplicationContext {
                                identity: observation.application_identity.clone(),
                                display_name: observation.display_name.clone(),
                                executable: Some(observation.application_identity.clone()),
                            }),
                            artifact: Some(ArtifactRef {
                                kind: ArtifactKind::Application,
                                display_name: observation.display_name.clone(),
                                reference: observation.application_identity.clone(),
                            }),
                            workspace: None,
                            location: None,
                            source: "windows".into(),
                            private_browsing: false,
                        };
                        let state = app.state::<AppState>();
                        if let Ok(mut engine) = state.engine.lock() {
                            let accepted = engine.record(event, &now());
                            if accepted {
                                if let Some(active) = engine.active_thread().cloned() {
                                    match persist_thread(&state, &active) {
                                        Ok(()) => {
                                            if let Ok(mut error) = state.persistence_error.lock() {
                                                *error = None;
                                            }
                                        }
                                        Err(error) => {
                                            if let Ok(mut error_state) =
                                                state.persistence_error.lock()
                                            {
                                                *error_state = Some(error);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        previous = Some(observation);
                        notify_state(&app);
                    }
                }
                Ok(None) => {}
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

#[cfg(not(windows))]
fn start_foreground_sensor(_app: tauri::AppHandle) {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .map(|window| window.set_focus());
        }))
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            append_log(app.handle(), "startup");
            let mut store = Store::open(data_dir.join("ariadne.sqlite"))?;
            import_legacy_directory(&mut store, &data_dir).map_err(std::io::Error::other)?;
            let policy = store.load_capture_policy()?;
            let generation = store.generation()?;
            let ipc_token = load_or_create_ipc_token(&data_dir).map_err(std::io::Error::other)?;
            let ipc_endpoint =
                write_ipc_descriptor(&data_dir, &ipc_token).map_err(std::io::Error::other)?;
            let mut revisions = HashMap::new();
            let mut engine = CoreEngine::new(RollingContext::default(), policy);

            for (thread, stored) in store.list_threads()? {
                revisions.insert(thread.id.clone(), stored.revision);
                engine.insert_thread(thread);
            }

            app.manage(AppState {
                engine: Mutex::new(engine),
                store: Mutex::new(store),
                cursor: Mutex::new(PersistenceCursor {
                    generation,
                    revisions,
                }),
                persistence_error: Mutex::new(None),
                sensor_state: Mutex::new(if cfg!(windows) {
                    "starting".into()
                } else {
                    "unsupported".into()
                }),
                adapter_state: Mutex::new("disconnected".into()),
            });
            let menu = MenuBuilder::new(app)
                .text("open", "Open Ariadne")
                .separator()
                .text("start", "Start Thread")
                .text("recent", "Save Recent Context")
                .text("checkpoint", "Checkpoint")
                .text("stop", "Stop Thread")
                .text("pause", "Pause Capture")
                .text("resume", "Resume Capture")
                .separator()
                .text("settings", "Settings")
                .text("exit", "Exit")
                .build()?;
            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "open" {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if event.id().as_ref() == "exit" {
                        app.exit(0);
                    } else {
                        let _ = app.emit("ariadne-tray-command", event.id().as_ref());
                    }
                })
                .build(app)?;
            start_ipc_server(app.handle().clone(), ipc_endpoint, ipc_token);
            start_foreground_sensor(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_capture_policy,
            get_data_location,
            list_threads,
            start_thread,
            save_recent_context,
            stop_thread,
            resume_thread,
            set_capture_paused,
            set_timed_pause,
            set_capture_exclusions,
            set_checkpoint,
            delete_thread,
            delete_all_data,
            open_logs,
            set_start_at_login,
            execute_resume_actions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ariadne");
}

fn main() {
    run();
}
