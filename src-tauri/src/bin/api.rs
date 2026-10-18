//! Loopback API for browser Vite (`npm run dev` / `npm run api`).
//! Tauri still starts the same server from `lib.rs` against the app data DB.

use std::process::ExitCode;

use tauri_app_lib::backend::{config::Config, logging, server};

#[tokio::main]
async fn main() -> ExitCode {
    // Loopback binary always defaults to the Vite port (even for `cargo run --release --bin api`).
    let config = match Config::load_loopback() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("config error: {error}");
            return ExitCode::FAILURE;
        }
    };

    let log_dir = logging::loopback_log_dir();
    let _log_guard = match logging::init(&config.log_level, &log_dir) {
        Ok(guard) => guard,
        Err(error) => {
            eprintln!("logging init failed: {error}");
            return ExitCode::FAILURE;
        }
    };

    let db_path = config.database_path.clone();
    tracing::info!(
        path = %db_path.display(),
        port = config.api_port,
        log_dir = %log_dir.display(),
        "API sqlite (supervised)"
    );

    // Never exit while the shop needs the API — restart on crash / bind races.
    server::run_supervised_at(db_path).await;
    ExitCode::SUCCESS
}
