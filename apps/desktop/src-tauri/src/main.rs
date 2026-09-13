use ariadne_core::{CoreEngine, RollingContext};
use ariadne_storage::Store;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
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
}

#[derive(Debug, Serialize)]
struct Status {
    capture_state: String,
    active_thread: Option<ariadne_core::Thread>,
    persistence_state: String,
    sensor_state: String,
    thread_count: usize,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn notify_state(app: &tauri::AppHandle) {
    let _ = app.emit("ariadne-state-changed", ());
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
        thread_count: store
            .list_threads()
            .map_err(|error| error.to_string())?
            .len(),
    })
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
    engine.policy.set_manual_pause(paused);
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let result = store
        .save_capture_policy(&engine.policy)
        .map_err(|error| error.to_string());
    let result = record_persistence(&state, result);
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
    let until = chrono::Utc::now() + chrono::Duration::minutes(minutes as i64);
    engine.policy.set_timed_pause(Some(
        until.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    ));
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let result = store
        .save_capture_policy(&engine.policy)
        .map_err(|error| error.to_string());
    let result = record_persistence(&state, result);
    if result.is_ok() {
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
            let store = Store::open(data_dir.join("ariadne.sqlite"))?;
            let policy = store.load_capture_policy()?;
            let generation = store.generation()?;
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
            });
            start_foreground_sensor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            list_threads,
            start_thread,
            save_recent_context,
            stop_thread,
            resume_thread,
            set_capture_paused,
            set_timed_pause,
            set_checkpoint,
            delete_thread,
            delete_all_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ariadne");
}

fn main() {
    run();
}
