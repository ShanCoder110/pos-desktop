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
    let mut options = ConnectOptions::new(url);
    options
        .max_connections(DATABASE_MAX_CONNECTIONS)
        .min_connections(DATABASE_MIN_CONNECTIONS)
        .sqlx_logging(false);

    let database = Database::connect(options).await?;
    // WAL/busy_timeout before migrate; foreign_keys after — initial.sql creates
    // branch_settings before customers, so FKs must be off during CREATE TABLE.
    apply_pragma(&database, "PRAGMA journal_mode = WAL").await?;
    apply_pragma(&database, "PRAGMA busy_timeout = 5000").await?;
    Migrator::up(&database, None).await?;
    apply_runtime_pragmas(&database).await?;
    Ok(database)
}

pub async fn connect_memory() -> Result<DatabaseConnection, AppError> {
    let database = Database::connect("sqlite::memory:").await?;
    apply_pragma(&database, "PRAGMA busy_timeout = 5000").await?;
    Migrator::up(&database, None).await?;
    apply_runtime_pragmas(&database).await?;
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
