use rust_decimal::{prelude::ToPrimitive, Decimal, RoundingStrategy};
use uuid::Uuid;

use crate::backend::{
    constants::{ERROR_INVALID_PHONE, MONEY_DECIMAL_PLACES, QUANTITY_DECIMAL_PLACES},
    errors::AppError,
};

pub fn parse_uuid(value: &str, field: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(format!("{field} must be a UUID.")))
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

pub fn optional_pk_mobile(raw: Option<&str>) -> Result<Option<String>, AppError> {
    let digits = raw.map(phone_digits).filter(|value| !value.is_empty());
    match digits {
        None => Ok(None),
        Some(digits) if digits.len() == 11 && digits.starts_with("03") => Ok(Some(digits)),
        Some(_) => Err(AppError::Validation(ERROR_INVALID_PHONE.into())),
    }
}
