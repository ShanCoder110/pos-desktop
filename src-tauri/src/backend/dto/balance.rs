use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct AdjustBalanceRequest {
    pub amount: Decimal,
    #[validate(length(min = 1, message = "Enter a reason for the adjustment"))]
    pub notes: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustBalanceResponse {
    pub balance_after: f64,
}
