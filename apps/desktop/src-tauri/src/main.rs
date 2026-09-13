use ariadne_core::{CapturePolicy, CoreEngine, RollingContext};
use ariadne_storage::Store;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState { engine: Mutex<CoreEngine>, store: Mutex<Store>, persistence_error: Mutex<Option<String>> }

#[derive(Serialize)]
struct Status { capture_state: String, active_thread: Option<ariadne_core::Thread>, persistence_state: String, thread_count: usize }

fn now() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }

fn persist_active(engine: &CoreEngine, store: &mut Store) -> Result<(), String> {
    let Some(thread) = engine.active_thread().cloned() else { return Ok(()); };
    let existing = store.load_thread(&thread.id).map_err(|e| e.to_string())?.map(|(_, stored)| stored.revision);
    let generation = store.generation().map_err(|e| e.to_string())?;
    store.save_thread(&thread, existing, generation).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> Result<Status, String> {
    let engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let persistence_state = state.persistence_error.lock().map_err(|_| "status lock poisoned")?.clone().unwrap_or_else(|| "available".into());
    Ok(Status { capture_state: if engine.policy.paused_until.is_some() { "paused" } else { "running" }.into(), active_thread: engine.active_thread().cloned(), persistence_state, thread_count: store.list_threads().map_err(|e| e.to_string())?.len() })
}

#[tauri::command]
fn list_threads(state: State<'_, AppState>) -> Result<Vec<ariadne_core::Thread>, String> {
    state.store.lock().map_err(|_| "storage lock poisoned")?.list_threads().map(|items| items.into_iter().map(|(thread, _)| thread).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_thread(name: String, state: State<'_, AppState>) -> Result<ariadne_core::Thread, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let thread = engine.start_thread(name, now()).map_err(|e| e.to_string())?.clone();
    let save_result = persist_active(&engine, &mut state.store.lock().map_err(|_| "storage lock poisoned")?);
    if let Err(error) = save_result {
        engine.delete_thread(&thread.id);
        *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = Some(error.clone());
        return Err(error);
    }
    *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = None;
    Ok(thread)
}

#[tauri::command]
fn stop_thread(state: State<'_, AppState>) -> Result<ariadne_core::Thread, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous = engine.active_thread().cloned();
    let thread = engine.stop_thread(now()).map_err(|e| e.to_string())?;
    let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
    let existing = store.load_thread(&thread.id).map_err(|e| e.to_string())?.map(|(_, stored)| stored.revision);
    let generation = store.generation().map_err(|e| e.to_string())?;
    if let Err(error) = store.save_thread(&thread, existing, generation).map_err(|e| e.to_string()) {
        if let Some(previous) = previous { engine.insert_thread(previous); }
        *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = Some(error.clone());
        return Err(error);
    }
    *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = None;
    Ok(thread)
}

#[tauri::command]
fn resume_thread(id: String, state: State<'_, AppState>) -> Result<ariadne_core::ResumePlan, String> {
    let mut engine = state.engine.lock().map_err(|_| "core lock poisoned")?;
    let previous = engine.thread(&id).cloned();
    let plan = engine.resume_thread(&id, now()).map_err(|e| e.to_string())?;
    if let Some(thread) = engine.thread(&id).cloned() {
        let mut store = state.store.lock().map_err(|_| "storage lock poisoned")?;
        let revision = store.load_thread(&id).map_err(|e| e.to_string())?.map(|(_, stored)| stored.revision);
        let generation = store.generation().map_err(|e| e.to_string())?;
        if let Err(error) = store.save_thread(&thread, revision, generation).map_err(|e| e.to_string()) {
            if let Some(previous) = previous { engine.insert_thread(previous); }
            *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = Some(error.clone());
            return Err(error);
        }
    }
    *state.persistence_error.lock().map_err(|_| "status lock poisoned")? = None;
    Ok(plan)
}

#[tauri::command]
fn set_capture_paused(paused: bool, state: State<'_, AppState>) -> Result<(), String> {
    state.engine.lock().map_err(|_| "core lock poisoned")?.policy.paused_until = paused.then(|| "9999-12-31T23:59:59Z".into());
    Ok(())
}

#[cfg(windows)]
fn start_foreground_sensor(app: tauri::AppHandle) {
    use ariadne_core::{ApplicationContext, ArtifactKind, ArtifactRef, ContextEvent, ContextEventType};
    use ariadne_platform_windows::observe_foreground;
    use std::time::Duration;
    std::thread::spawn(move || {
        let mut previous: Option<ariadne_platform_windows::ForegroundObservation> = None;
        loop {
            if let Ok(Some(observation)) = observe_foreground() {
                let changed = previous.as_ref() != Some(&observation);
                if changed {
                    let event = ContextEvent {
                        id: uuid::Uuid::new_v4().to_string(), timestamp: now(),
                        event_type: ContextEventType::ApplicationFocused,
                        application: Some(ApplicationContext { identity: observation.application_identity.clone(), display_name: observation.display_name.clone(), executable: Some(observation.application_identity.clone()) }),
                        artifact: Some(ArtifactRef { kind: ArtifactKind::Application, display_name: observation.display_name.clone(), reference: observation.application_identity.clone() }),
                        workspace: None, location: None, source: "windows".into(), private_browsing: false,
                    };
                    let state = app.state::<AppState>();
                    if let (Ok(mut engine), Ok(mut store)) = (state.engine.lock(), state.store.lock()) {
                        let accepted = engine.record(event, &now());
                        if accepted {
                            if let Err(error) = persist_active(&engine, &mut store) {
                                if let Ok(mut state_error) = state.persistence_error.lock() { *state_error = Some(error); }
                            } else if let Ok(mut state_error) = state.persistence_error.lock() { *state_error = None; }
                        }
                        if accepted { previous = Some(observation.clone()); }
                    }
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

#[cfg(not(windows))]
fn start_foreground_sensor(_app: tauri::AppHandle) {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| { let _ = app.get_webview_window("main").map(|window| window.set_focus()); }))
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = Store::open(data_dir.join("ariadne.sqlite"))?;
            let mut engine = CoreEngine::new(RollingContext::default(), CapturePolicy::default());
            for (thread, _) in store.list_threads()? { engine.insert_thread(thread); }
            app.manage(AppState { engine: Mutex::new(engine), store: Mutex::new(store), persistence_error: Mutex::new(None) });
            start_foreground_sensor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_status, list_threads, start_thread, stop_thread, resume_thread, set_capture_paused])
        .run(tauri::generate_context!())
        .expect("error while running Ariadne");
}

fn main() { run(); }
