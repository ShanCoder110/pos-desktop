pub mod backend;
mod printers;

use backend::{config::Config, constants::LOG_TARGET, logging, server};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            printers::list_system_printers,
            printers::cut_thermal_paper
        ])
        .setup(|app| {
            if let Err(error) = Config::load() {
                eprintln!("config load failed: {error}");
                return Err(Box::<dyn std::error::Error + Send + Sync>::from(error));
            }

            let log_dir = app
                .path()
                .app_data_dir()
                .map(|dir| dir.join("logs"))
                .unwrap_or_else(|_| logging::loopback_log_dir());
            let log_guard = match logging::init(&Config::get().log_level, &log_dir) {
                Ok(guard) => guard,
                Err(error) => {
                    return Err(Box::<dyn std::error::Error + Send + Sync>::from(error));
                }
            };
            // Keep the file handle alive for the process lifetime.
            app.manage(LogGuardSlot(log_guard));

            let handle = app.handle().clone();
            let port = Config::get().api_port;
            tracing::info!(
                target: LOG_TARGET,
                port,
                "starting supervised desktop API"
            );
            tauri::async_runtime::spawn(async move {
                server::run_supervised(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[allow(dead_code)] // held so daily log file stays open until app exit
struct LogGuardSlot(logging::LogGuard);
