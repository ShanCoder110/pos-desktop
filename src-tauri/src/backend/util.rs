use rust_decimal::{prelude::ToPrimitive, Decimal, RoundingStrategy};
use uuid::Uuid;

use crate::backend::{
    constants::{ERROR_INVALID_PHONE, MONEY_DECIMAL_PLACES, QUANTITY_DECIMAL_PLACES},
    errors::AppError,
};

pub fn parse_uuid(value: &str, field: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(format!("{field} must be a UUID.")))
}

/// Bind a UUID as a 16-byte SQLite BLOB (never as hyphenated TEXT).
/// Prefer this over `Uuid.into()` on INSERT/UPDATE paths that historically
/// risked `uuid.to_string().into()` writing 36-char TEXT and breaking SeaORM decode.
pub fn uuid_blob(id: Uuid) -> sea_orm::Value {
    sea_orm::Value::Bytes(Some(Box::new(id.as_bytes().to_vec())))
}

/// Bind an optional UUID as BLOB, or SQL NULL.
pub fn optional_uuid_blob(id: Option<Uuid>) -> sea_orm::Value {
    match id {
        Some(value) => uuid_blob(value),
        None => sea_orm::Value::Bytes(None),
    }
}

pub fn parse_optional_uuid(value: Option<&str>, field: &str) -> Result<Option<Uuid>, AppError> {
    value.map(|raw| parse_uuid(raw, field)).transpose()
}

pub fn trimmed(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub fn money_value(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(MONEY_DECIMAL_PLACES, RoundingStrategy::MidpointAwayFromZero)
}

pub fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}

pub fn quantity(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(
        QUANTITY_DECIMAL_PLACES,
        RoundingStrategy::MidpointAwayFromZero,
    )
}

pub fn parse_date(value: &str, message: &'static str) -> Result<chrono::NaiveDate, AppError> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(message.into()))
}

pub fn now_utc() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

pub fn phone_digits(value: &str) -> String {
    value.chars().filter(|ch| ch.is_ascii_digit()).collect()
}

pub fn csv_values(value: Option<&str>) -> Vec<String> {
    value
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub fn push_in_uuids(
    parts: &mut Vec<String>,
    values: &mut Vec<sea_orm::Value>,
    column: &str,
    raw: Option<&str>,
    field: &str,
) -> Result<(), AppError> {
    let items = csv_values(raw);
    if items.is_empty() {
        return Ok(());
    }
    if items.len() == 1 {
        parts.push(format!("{column} = ?"));
        values.push(parse_uuid(&items[0], field)?.into());
        return Ok(());
    }
    let placeholders = items.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    parts.push(format!("{column} IN ({placeholders})"));
    for item in &items {
        values.push(parse_uuid(item, field)?.into());
    }
    Ok(())
}

pub fn push_in_strings(
    parts: &mut Vec<String>,
    values: &mut Vec<sea_orm::Value>,
    column: &str,
    raw: Option<&str>,
    uppercase: bool,
) {
    let items = csv_values(raw);
    if items.is_empty() {
        return;
    }
    if items.len() == 1 {
        parts.push(format!("{column} = ?"));
        let value = if uppercase {
            items[0].to_uppercase()
        } else {
            items[0].clone()
        };
        values.push(value.into());
        return;
    }
    let placeholders = items.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    parts.push(format!("{column} IN ({placeholders})"));
    for item in items {
        let value = if uppercase {
            item.to_uppercase()
        } else {
            item.clone()
        };
        values.push(value.into());
    }
}

pub fn push_in_like(
    parts: &mut Vec<String>,
    values: &mut Vec<sea_orm::Value>,
    column: &str,
    raw: Option<&str>,
) {
    let items = csv_values(raw);
    if items.is_empty() {
        return;
    }
    if items.len() == 1 {
        parts.push(format!("lower({column}) LIKE ?"));
        values.push(format!("%{}%", items[0].to_lowercase()).into());
        return;
    }
    let clauses = items
        .iter()
        .map(|_| format!("lower({column}) LIKE ?"))
        .collect::<Vec<_>>()
        .join(" OR ");
    parts.push(format!("({clauses})"));
    for item in items {
        values.push(format!("%{}%", item.to_lowercase()).into());
    }
}

pub fn push_balance_bucket_or(parts: &mut Vec<String>, balance_expr: &str, raw: Option<&str>) {
    let items = csv_values(raw);
    if items.is_empty() {
        return;
    }
    let clauses = items
        .iter()
        .filter_map(|value| match value.to_ascii_lowercase().as_str() {
            "payable" | "owes" => Some(format!("({balance_expr}) > 0")),
            "advance" => Some(format!("({balance_expr}) < 0")),
            "settled" => Some(format!("({balance_expr}) = 0")),
            _ => None,
        })
        .collect::<Vec<_>>();
    if clauses.is_empty() {
        return;
    }
    if clauses.len() == 1 {
        parts.push(clauses[0].clone());
        return;
    }
    parts.push(format!("({})", clauses.join(" OR ")));
}

pub fn optional_pk_mobile(raw: Option<&str>) -> Result<Option<String>, AppError> {
    let digits = raw.map(phone_digits).filter(|value| !value.is_empty());
    match digits {
        None => Ok(None),
        Some(digits) if digits.len() == 11 && digits.starts_with("03") => Ok(Some(digits)),
        Some(_) => Err(AppError::Validation(ERROR_INVALID_PHONE.into())),
    }
}
