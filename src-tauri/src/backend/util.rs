use rust_decimal::{Decimal, RoundingStrategy};
use uuid::Uuid;

use crate::backend::{
    constants::{MONEY_DECIMAL_PLACES, QUANTITY_DECIMAL_PLACES},
    errors::AppError,
};

pub fn parse_uuid(value: &str, field: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(format!("{field} must be a UUID.")))
}

pub fn parse_optional_uuid(value: Option<&str>, field: &str) -> Result<Option<Uuid>, AppError> {
    value
        .map(|raw| parse_uuid(raw, field))
        .transpose()
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
