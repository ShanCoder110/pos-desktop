//! Process-wide tracing: stdout + one daily `.txt` file under `log_dir`.
//! Files look like `dukan-2026-10-18.txt`. Older than [`LOG_RETENTION_DAYS`] are deleted on boot.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use super::constants::{LOG_RETENTION_DAYS, LOG_TARGET};

/// Holds the daily file open; drop only when the process exits.
pub struct LogGuard {
    _writer: DailyTxt,
}

/// Init stdout + daily file logging. Safe to call once per process.
/// Returns a guard that must be kept alive so the file handle stays open.
pub fn init(log_level: &str, log_dir: impl AsRef<Path>) -> Result<LogGuard, String> {
    let log_dir = log_dir.as_ref().to_path_buf();
    std::fs::create_dir_all(&log_dir)
        .map_err(|error| format!("create log dir {}: {error}", log_dir.display()))?;

    prune_old_logs(&log_dir);

    let level = log_level.trim();
    let level = if level.is_empty() { "info" } else { level };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!("{level},tower_http=info,dukan_pos_backend=info"))
    });

    let daily = DailyTxt::open(log_dir.clone())?;

    let stdout_layer = fmt::layer().with_target(true).with_writer(std::io::stdout);
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_target(true)
        .with_writer(daily.clone());

    tracing_subscriber::registry()
        .with(filter)
        .with(stdout_layer)
        .with(file_layer)
        .try_init()
        .map_err(|error| format!("tracing init: {error}"))?;

    tracing::info!(
        target: LOG_TARGET,
        path = %log_dir.display(),
        level,
        retention_days = LOG_RETENTION_DAYS,
        "logging ready (daily .txt + stdout)"
    );

    Ok(LogGuard { _writer: daily })
}

/// Loopback default: `./logs` next to the process cwd.
pub fn loopback_log_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("LOG_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    PathBuf::from("logs")
}

/// Delete `dukan-YYYY-MM-DD.txt` files older than the retention window.
fn prune_old_logs(dir: &Path) {
    let today = Local::now().date_naive();
    let oldest_keep = today - Duration::days(LOG_RETENTION_DAYS.saturating_sub(1));
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Some(date_str) = name
            .strip_prefix("dukan-")
            .and_then(|rest| rest.strip_suffix(".txt"))
        else {
            continue;
        };
        let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") else {
            continue;
        };
        if date < oldest_keep {
            if let Err(error) = fs::remove_file(entry.path()) {
                eprintln!(
                    "could not delete old log {}: {error}",
                    entry.path().display()
                );
            }
        }
    }
}

#[derive(Clone)]
struct DailyTxt {
    dir: PathBuf,
    state: std::sync::Arc<Mutex<(String, File)>>,
}

impl DailyTxt {
    fn open(dir: PathBuf) -> Result<Self, String> {
        let date = Local::now().format("%Y-%m-%d").to_string();
        let path = dir.join(format!("dukan-{date}.txt"));
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("open log {}: {error}", path.display()))?;
        Ok(Self {
            dir,
            state: std::sync::Arc::new(Mutex::new((date, file))),
        })
    }

    fn write_all(&self, buf: &[u8]) -> io::Result<()> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let mut guard = self
            .state
            .lock()
            .map_err(|_| io::Error::other("log mutex poisoned"))?;
        if guard.0 != today {
            // Midnight rollover — drop files outside the retention window.
            prune_old_logs(&self.dir);
            let path = self.dir.join(format!("dukan-{today}.txt"));
            let file = OpenOptions::new().create(true).append(true).open(path)?;
            *guard = (today, file);
        }
        guard.1.write_all(buf)?;
        guard.1.flush()
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for DailyTxt {
    type Writer = DailyTxtHandle;

    fn make_writer(&'a self) -> Self::Writer {
        DailyTxtHandle(self.clone())
    }
}

struct DailyTxtHandle(DailyTxt);

impl Write for DailyTxtHandle {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
