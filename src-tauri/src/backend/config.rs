//! Process config loaded once at startup from `.env` / the environment.
//! Other modules read [`Config::get`] — never call `std::env::var` at call sites.

use std::fmt;
use std::path::PathBuf;
use std::sync::OnceLock;

static CONFIG: OnceLock<Config> = OnceLock::new();

/// Redacted in `Debug` so tracing never dumps passwords.
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("***")
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub app_env: String,
    pub log_level: String,
    pub api_host: String,
    pub api_port: u16,
    pub database_path: PathBuf,
    pub access_token_ttl_minutes: i64,
    pub refresh_token_ttl_days: i64,
    pub default_staff_password: SecretString,
    pub cloud_sync_enabled: bool,
    pub supabase_url: Option<String>,
    pub supabase_anon_key: Option<SecretString>,
    pub supabase_service_role_key: Option<SecretString>,
}

impl Config {
    /// Load `.env` (if present), then require every local-mode var. Call once before serving.
    pub fn load() -> Result<&'static Config, String> {
        if CONFIG.get().is_some() {
            return Ok(CONFIG.get().expect("config set"));
        }
        // Prefer repo-root `.env`, then cwd (Cargo may run with cwd=src-tauri).
        let _ = dotenvy::from_filename(".env");
        let _ = dotenvy::from_filename("../.env");
        let _ = dotenvy::dotenv();
        let config = Self::from_env()?;
        CONFIG
            .set(config)
            .map_err(|_| "config already initialized".to_string())?;
        Ok(CONFIG.get().expect("config set"))
    }

    pub fn get() -> &'static Config {
        CONFIG
            .get()
            .expect("Config::load() must run before Config::get()")
    }

    pub fn try_get() -> Option<&'static Config> {
        CONFIG.get()
    }

    fn from_env() -> Result<Self, String> {
        let app_env = required("APP_ENV")?;
        let cloud_sync_enabled =
            parse_bool(&optional("CLOUD_SYNC_ENABLED").unwrap_or_else(|| "false".into()))?;

        let supabase_url = optional("SUPABASE_URL");
        let supabase_anon_key = optional("SUPABASE_ANON_KEY").map(SecretString);
        let supabase_service_role_key = optional("SUPABASE_SERVICE_ROLE_KEY").map(SecretString);

        if cloud_sync_enabled {
            if supabase_url
                .as_ref()
                .map(String::as_str)
                .unwrap_or("")
                .is_empty()
            {
                return Err("CLOUD_SYNC_ENABLED=true requires SUPABASE_URL".into());
            }
            if supabase_service_role_key
                .as_ref()
                .map(|value| value.expose().is_empty())
                .unwrap_or(true)
            {
                return Err(
                    "CLOUD_SYNC_ENABLED=true requires SUPABASE_SERVICE_ROLE_KEY (Rust only)".into(),
                );
            }
        }

        Ok(Self {
            app_env,
            log_level: required("LOG_LEVEL")?,
            api_host: required("API_HOST")?,
            api_port: parse_port(&required("API_PORT")?)?,
            database_path: PathBuf::from(required("DUKAN_DB_PATH")?),
            access_token_ttl_minutes: parse_duration_minutes(&required("ACCESS_TOKEN_EXPIRY")?)?,
            refresh_token_ttl_days: parse_duration_days(&required("REFRESH_TOKEN_EXPIRY")?)?,
            default_staff_password: SecretString(required("DEFAULT_STAFF_PASSWORD")?),
            cloud_sync_enabled,
            supabase_url,
            supabase_anon_key,
            supabase_service_role_key,
        })
    }
}

fn required(key: &str) -> Result<String, String> {
    std::env::var(key)
        .map_err(|_| format!("missing required env var `{key}` (see .env.example)"))
        .and_then(|value| {
            let trimmed = value.trim().to_owned();
            if trimmed.is_empty() {
                Err(format!("env var `{key}` is empty (see .env.example)"))
            } else {
                Ok(trimmed)
            }
        })
}

fn optional(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_bool(raw: &str) -> Result<bool, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" => Ok(false),
        other => Err(format!("invalid boolean `{other}`")),
    }
}

fn parse_port(raw: &str) -> Result<u16, String> {
    raw.parse::<u16>()
        .map_err(|_| format!("invalid API_PORT `{raw}` (expected 1–65535)"))
}

/// `15m`, `1h`, `60` (minutes if bare number).
fn parse_duration_minutes(raw: &str) -> Result<i64, String> {
    let raw = raw.trim();
    if let Ok(minutes) = raw.parse::<i64>() {
        return ensure_positive("ACCESS_TOKEN_EXPIRY", minutes);
    }
    let (number, unit) = split_duration(raw)?;
    let minutes = match unit {
        "s" => (number + 59) / 60,
        "m" => number,
        "h" => number.saturating_mul(60),
        "d" => number.saturating_mul(60 * 24),
        other => {
            return Err(format!(
                "invalid ACCESS_TOKEN_EXPIRY unit `{other}` (use s/m/h/d)"
            ))
        }
    };
    ensure_positive("ACCESS_TOKEN_EXPIRY", minutes)
}

/// `7d`, `168h`, or bare number = days.
fn parse_duration_days(raw: &str) -> Result<i64, String> {
    let raw = raw.trim();
    if let Ok(days) = raw.parse::<i64>() {
        return ensure_positive("REFRESH_TOKEN_EXPIRY", days);
    }
    let (number, unit) = split_duration(raw)?;
    let days = match unit {
        "d" => number,
        "h" => (number + 23) / 24,
        "m" => (number + (60 * 24 - 1)) / (60 * 24),
        "s" => (number + (86_400 - 1)) / 86_400,
        other => {
            return Err(format!(
                "invalid REFRESH_TOKEN_EXPIRY unit `{other}` (use s/m/h/d)"
            ))
        }
    };
    ensure_positive("REFRESH_TOKEN_EXPIRY", days)
}

fn split_duration(raw: &str) -> Result<(i64, &str), String> {
    let split = raw
        .char_indices()
        .find(|(_, ch)| ch.is_ascii_alphabetic())
        .map(|(index, _)| index)
        .ok_or_else(|| format!("invalid duration `{raw}`"))?;
    let (number_part, unit) = raw.split_at(split);
    let number = number_part
        .parse::<i64>()
        .map_err(|_| format!("invalid duration number in `{raw}`"))?;
    Ok((number, unit))
}

fn ensure_positive(key: &str, value: i64) -> Result<i64, String> {
    if value <= 0 {
        Err(format!("`{key}` must be > 0"))
    } else {
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minutes() {
        assert_eq!(parse_duration_minutes("15m").unwrap(), 15);
        assert_eq!(parse_duration_minutes("1h").unwrap(), 60);
        assert_eq!(parse_duration_minutes("60").unwrap(), 60);
    }

    #[test]
    fn parses_days() {
        assert_eq!(parse_duration_days("30d").unwrap(), 30);
        assert_eq!(parse_duration_days("7").unwrap(), 7);
    }
}
