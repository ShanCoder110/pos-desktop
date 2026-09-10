use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize};
use std::str::FromStr;
use validator::Validate;

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct MasterRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
    #[validate(length(max = 32))]
    #[serde(default)]
    pub symbol: Option<String>,
    #[validate(length(max = 32))]
    #[serde(default, deserialize_with = "empty_string_as_none")]
    pub phone: Option<String>,
    #[validate(email(message = "Enter a valid email"))]
    #[serde(default, deserialize_with = "empty_string_as_none")]
    pub email: Option<String>,
    #[validate(length(max = 500))]
    #[serde(default, deserialize_with = "empty_string_as_none")]
    pub address: Option<String>,
    #[validate(length(max = 1_000))]
    #[serde(default, deserialize_with = "empty_string_as_none")]
    pub notes: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub precision: Option<i16>,
    #[serde(default, deserialize_with = "opt_decimal")]
    pub credit_limit: Option<Decimal>,
    #[serde(default)]
    pub payment_terms_days: Option<i32>,
    #[serde(default)]
    pub is_walk_in: bool,
}

fn empty_string_as_none<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    Ok(value.and_then(|text| {
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    }))
}

fn opt_decimal<'de, D>(deserializer: D) -> Result<Option<Decimal>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    match value {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            Decimal::from_str(trimmed).map(Some).map_err(serde::de::Error::custom)
        }
        Some(serde_json::Value::Number(number)) => Decimal::from_str(&number.to_string())
            .map(Some)
            .map_err(serde::de::Error::custom),
        Some(_) => Err(serde::de::Error::custom("creditLimit must be a number")),
    }
}

const fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterResponse {
    pub id: String,
    pub name: String,
    pub symbol: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub precision: Option<i16>,
    pub credit_limit: Option<f64>,
    pub payment_terms_days: Option<i32>,
    pub is_walk_in: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}
