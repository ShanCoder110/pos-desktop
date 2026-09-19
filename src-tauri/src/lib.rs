pub mod backend;

use backend::{config::Config, constants::LOG_TARGET, server};
use tracing::error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(true)
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Err(error) = Config::load() {
                error!(target: LOG_TARGET, %error, "config load failed");
                return Err(Box::<dyn std::error::Error + Send + Sync>::from(error));
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server::start(handle).await {
                    error!(target: LOG_TARGET, %error, "backend server stopped");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
