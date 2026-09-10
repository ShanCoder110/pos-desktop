//! Loopback API for browser Vite (`npm run dev` / `npm run api`).
//! Tauri still starts the same server from `lib.rs` against the app data DB.

use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use tauri_app_lib::backend::{constants::DATABASE_FILE_NAME, server};

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info,tower_http=info")
            }),
        )
        .with_target(true)
        .try_init()
        .ok();

    let db_path = env::var("DUKAN_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("data").join(DATABASE_FILE_NAME));

    eprintln!("API sqlite {}", db_path.display());
    match server::start_at(db_path).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("backend failed: {error}");
            ExitCode::FAILURE
        }
    }
}
