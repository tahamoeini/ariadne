//! SQLite persistence for the canonical Ariadne state.
//!
//! The Core remains storage-agnostic. This crate adds transactions, schema
//! migrations, optimistic revision checks, and tombstones so delayed writes
//! cannot resurrect deleted Threads.

use ariadne_core::Thread;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

mod legacy;
pub use legacy::{import_legacy_investigation_json, LegacyImportResult};

pub const DATABASE_SCHEMA_VERSION: i32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("stale Thread write: expected revision {expected}, found {actual}")]
    StaleWrite { expected: i64, actual: i64 },
    #[error("Thread {0} was deleted")]
    Deleted(String),
    #[error("invalid legacy Investigation: {0}")]
    InvalidLegacy(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StoredThread {
    pub revision: i64,
    pub generation: i64,
}

pub struct Store {
    connection: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let store = Self { connection };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self, StorageError> {
        let connection = Connection::open_in_memory()?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let store = Self { connection };
        store.migrate()?;
        Ok(store)
    }

    pub fn save_thread(
        &mut self,
        thread: &Thread,
        expected_revision: Option<i64>,
        generation: i64,
    ) -> Result<StoredThread, StorageError> {
        let tx = self.connection.transaction()?;
        let current_generation = current_generation(&tx)?;
        if current_generation != generation {
            return Err(StorageError::StaleWrite { expected: generation, actual: current_generation });
        }
        if tx.query_row("SELECT id FROM thread_tombstones WHERE id = ?1", [thread.id.as_str()], |row| row.get::<_, String>(0)).optional()?.is_some() {
            return Err(StorageError::Deleted(thread.id.clone()));
        }
        let payload = serde_json::to_string(thread)?;
        let current_revision: Option<i64> = tx.query_row("SELECT revision FROM threads WHERE id = ?1", [thread.id.as_str()], |row| row.get(0)).optional()?;
        let expected = expected_revision.unwrap_or(0);
        match current_revision {
            None if expected == 0 => {
                tx.execute("INSERT INTO threads (id, name, workspace, saved_at, active, revision, generation, payload_json) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)", params![&thread.id, &thread.name, &thread.workspace, &thread.saved_at, thread.active, generation, &payload])?;
                tx.commit()?;
                Ok(StoredThread { revision: 1, generation })
            }
            None => Err(StorageError::StaleWrite { expected, actual: 0 }),
            Some(actual) if actual != expected => Err(StorageError::StaleWrite { expected, actual }),
            Some(_) => {
                let next = expected + 1;
                tx.execute("UPDATE threads SET name = ?2, workspace = ?3, saved_at = ?4, active = ?5, revision = ?6, generation = ?7, payload_json = ?8 WHERE id = ?1 AND revision = ?9", params![&thread.id, &thread.name, &thread.workspace, &thread.saved_at, thread.active, next, generation, &payload, expected])?;
                tx.commit()?;
                Ok(StoredThread { revision: next, generation })
            }
        }
    }

    pub fn load_thread(&self, id: &str) -> Result<Option<(Thread, StoredThread)>, StorageError> {
        let row = self.connection.query_row("SELECT revision, generation, payload_json FROM threads WHERE id = ?1", [id], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))).optional()?;
        row.map(|(revision, generation, payload)| Ok((serde_json::from_str(&payload)?, StoredThread { revision, generation }))).transpose()
    }

    pub fn list_threads(&self) -> Result<Vec<(Thread, StoredThread)>, StorageError> {
        let mut statement = self.connection.prepare("SELECT revision, generation, payload_json FROM threads ORDER BY saved_at DESC")?;
        let rows = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?)))?;
        rows.map(|row| {
            let (revision, generation, payload) = row?;
            Ok((serde_json::from_str(&payload)?, StoredThread { revision, generation }))
        }).collect()
    }

    pub fn delete_thread(&mut self, id: &str, now: &str) -> Result<bool, StorageError> {
        let tx = self.connection.transaction()?;
        let changed = tx.execute("DELETE FROM threads WHERE id = ?1", [id])?;
        if changed > 0 { tx.execute("INSERT OR REPLACE INTO thread_tombstones (id, deleted_at) VALUES (?1, ?2)", params![id, now])?; }
        tx.commit()?;
        Ok(changed > 0)
    }

    pub fn delete_all(&mut self, now: &str) -> Result<i64, StorageError> {
        let tx = self.connection.transaction()?;
        let count = tx.execute("DELETE FROM threads", [])? as i64;
        tx.execute("DELETE FROM thread_tombstones", [])?;
        tx.execute("INSERT INTO metadata (key, value) VALUES ('generation', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1", [])?;
        tx.execute("INSERT INTO metadata (key, value) VALUES ('last_delete_all_at', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [now])?;
        tx.commit()?;
        Ok(count)
    }

    pub fn generation(&self) -> Result<i64, StorageError> { Ok(current_generation(&self.connection)?) }

    fn migrate(&self) -> Result<(), StorageError> {
        self.connection.execute_batch("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, name TEXT NOT NULL, workspace TEXT, saved_at TEXT NOT NULL, active INTEGER NOT NULL, revision INTEGER NOT NULL, generation INTEGER NOT NULL, payload_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS thread_tombstones (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL); INSERT INTO metadata (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING; INSERT INTO metadata (key, value) VALUES ('generation', '0') ON CONFLICT(key) DO NOTHING;")?;
        Ok(())
    }
}

fn current_generation(connection: &Connection) -> Result<i64, rusqlite::Error> {
    connection.query_row("SELECT value FROM metadata WHERE key = 'generation'", [], |row| row.get::<_, String>(0)).map(|value| value.parse::<i64>().unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ariadne_core::{ContextEvent, ContextEventType};

    #[test]
    fn stale_revision_is_rejected() {
        let mut store = Store::open_in_memory().unwrap();
        let thread = Thread::new("test", "2026-01-01T00:00:00Z").unwrap();
        let saved = store.save_thread(&thread, None, 0).unwrap();
        assert_eq!(saved.revision, 1);
        let error = store.save_thread(&thread, Some(0), 0).unwrap_err();
        assert!(matches!(error, StorageError::StaleWrite { .. }));
    }

    #[test]
    fn delete_all_invalidates_old_generation() {
        let mut store = Store::open_in_memory().unwrap();
        let thread = Thread::new("test", "2026-01-01T00:00:00Z").unwrap();
        store.save_thread(&thread, None, 0).unwrap();
        store.delete_all("2026-01-01T00:01:00Z").unwrap();
        let error = store.save_thread(&thread, Some(1), 0).unwrap_err();
        assert!(matches!(error, StorageError::StaleWrite { .. }));
        let _ = ContextEvent { id: "x".into(), timestamp: "x".into(), event_type: ContextEventType::ThreadStarted, application: None, artifact: None, workspace: None, location: None, source: "test".into(), private_browsing: false };
    }

    #[test]
    fn legacy_import_is_non_destructive_and_idempotent() {
        let mut store = Store::open_in_memory().unwrap();
        let legacy = r#"{
          "schemaVersion": 6,
          "investigation": {
            "id": "legacy-1",
            "name": "Old investigation",
            "workspace": "/work/project",
            "createdAt": "2026-01-01T00:00:00Z",
            "savedAt": "2026-01-01T00:05:00Z",
            "snapshot": { "editedFiles": ["/work/project/src/main.ts"], "visitedFileCounts": {"/work/project/src/main.ts": 3} },
            "browserReferences": [{"url":"https://example.com/docs?token=secret","title":"Docs","capturedAt":"2026-01-01T00:01:00Z"}]
          }
        }"#;
        let first = import_legacy_investigation_json(&mut store, legacy, 0).unwrap();
        assert!(first.imported);
        let second = import_legacy_investigation_json(&mut store, legacy, 0).unwrap();
        assert!(second.already_present);
        let (thread, _) = store.load_thread("legacy-1").unwrap().unwrap();
        assert_eq!(thread.artifacts.len(), 1);
        assert_eq!(thread.artifacts[0].visit_count, 3);
        assert_eq!(thread.references[0].url, "https://example.com/docs");
    }
}
