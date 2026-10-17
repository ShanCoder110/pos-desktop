use std::path::PathBuf;

use sea_orm::{
    ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbBackend, Statement,
};
use sea_orm_migration::MigratorTrait;
use tauri::{AppHandle, Manager};

use super::{
    constants::{
        DATABASE_FILE_NAME, DATABASE_MAX_CONNECTIONS, DATABASE_MIN_CONNECTIONS, SQLITE_OPTIONS,
        SQLITE_URL_PREFIX,
    },
    errors::AppError,
    migration::Migrator,
};

pub async fn connect(app: &AppHandle) -> Result<DatabaseConnection, AppError> {
    let directory = app.path().app_data_dir().map_err(AppError::internal)?;
    std::fs::create_dir_all(&directory).map_err(AppError::internal)?;
    connect_at(directory.join(DATABASE_FILE_NAME)).await
}

pub async fn connect_at(path: PathBuf) -> Result<DatabaseConnection, AppError> {
    connect_path(path).await
}

/// Open (or create) a SQLite file, run migrations, then enable foreign keys.
/// Used by the Tauri app and the `db` CLI (`cargo run --bin db`).
pub async fn connect_path(path: PathBuf) -> Result<DatabaseConnection, AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::internal)?;
    }
    let url = format!(
        "{SQLITE_URL_PREFIX}{}{SQLITE_OPTIONS}",
        path.to_string_lossy()
    );

    // Migrate on a single connection. sqlx enables foreign_keys=ON per checkout;
    // table-rebuild migrations (e.g. invoices CHECK widen) set PRAGMA OFF and
    // must keep that setting for DROP/CREATE on the same connection.
    let mut migrate_options = ConnectOptions::new(url.clone());
    migrate_options
        .max_connections(1)
        .min_connections(1)
        .sqlx_logging(false);
    let migrate_db = Database::connect(migrate_options).await?;
    // WAL/busy_timeout before migrate; foreign_keys after — initial.sql creates
    // branch_settings before customers, so FKs must be off during CREATE TABLE.
    apply_pragma(&migrate_db, "PRAGMA journal_mode = WAL").await?;
    apply_pragma(&migrate_db, "PRAGMA busy_timeout = 5000").await?;
    Migrator::up(&migrate_db, None).await?;
    migrate_db.close().await?;

    let mut options = ConnectOptions::new(url);
    options
        .max_connections(DATABASE_MAX_CONNECTIONS)
        .min_connections(DATABASE_MIN_CONNECTIONS)
        .sqlx_logging(false);
    let database = Database::connect(options).await?;
    apply_pragma(&database, "PRAGMA journal_mode = WAL").await?;
    apply_pragma(&database, "PRAGMA busy_timeout = 5000").await?;
    apply_runtime_pragmas(&database).await?;
    // Idempotent repair for any rows written before stable rowid ordering existed.
    crate::backend::repositories::LedgerRepository::recompute_balances(&database).await?;
    Ok(database)
}

pub async fn connect_memory() -> Result<DatabaseConnection, AppError> {
    // Single connection: same PRAGMA foreign_keys requirement as connect_path.
    let mut options = ConnectOptions::new("sqlite::memory:");
    options
        .max_connections(1)
        .min_connections(1)
        .sqlx_logging(false);
    let database = Database::connect(options).await?;
    apply_pragma(&database, "PRAGMA busy_timeout = 5000").await?;
    Migrator::up(&database, None).await?;
    apply_runtime_pragmas(&database).await?;
    crate::backend::repositories::LedgerRepository::recompute_balances(&database).await?;
    Ok(database)
}

/// Enable foreign keys after schema/migrations are applied.
pub async fn apply_runtime_pragmas(database: &DatabaseConnection) -> Result<(), AppError> {
    apply_pragma(database, "PRAGMA foreign_keys = ON").await
}

async fn apply_pragma(database: &DatabaseConnection, pragma: &str) -> Result<(), AppError> {
    database
        .execute_raw(Statement::from_string(DbBackend::Sqlite, pragma.to_owned()))
        .await?;
    Ok(())
}
