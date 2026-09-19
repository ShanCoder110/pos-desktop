//! Loopback API for browser Vite (`npm run dev` / `npm run api`).
//! Tauri still starts the same server from `lib.rs` against the app data DB.

use std::process::ExitCode;

use tauri_app_lib::backend::{config::Config, server};

#[tokio::main]
async fn main() -> ExitCode {
    let config = match Config::load() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("config error: {error}");
            return ExitCode::FAILURE;
        }
    };

    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new(format!("{},tower_http=info", config.log_level.trim()))
    });
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .try_init()
        .ok();

    let db_path = config.database_path.clone();
    tracing::info!(path = %db_path.display(), "API sqlite");
    match server::start_at(db_path).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "backend failed");
            ExitCode::FAILURE
        }
    }
}
