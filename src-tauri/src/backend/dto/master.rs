use serde::{Deserialize, Deserializer, Serialize};
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
    #[serde(default)]
    pub is_walk_in: bool,
    /// Opening balance. Positive = shop owes supplier / customer owes shop. Negative = advance.
    #[serde(default)]
    pub previous_balance: Option<f64>,
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
    pub balance: Option<f64>,
    pub is_walk_in: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}
