use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::Validate;

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StaffLedgerListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub user: Option<String>,
    pub entry_type: Option<String>,
    pub debit: Option<f64>,
    pub credit: Option<f64>,
    pub occurred_from: Option<String>,
    pub occurred_to: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffLedgerEntryResponse {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    pub branch_id: String,
    pub entry_type: String,
    pub money_transaction_id: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub balance_after: f64,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffLedgerResponse {
    pub user_id: String,
    pub total_paid: f64,
    pub paid_this_month: f64,
    pub entries: Vec<StaffLedgerEntryResponse>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct StaffPayoutRequest {
    #[validate(custom(function = "positive_decimal"))]
    pub amount: Decimal,
    #[validate(length(min = 1, max = 32))]
    pub payout_type: String,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,
    #[validate(length(max = 1_000))]
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffPayoutResponse {
    pub id: String,
    pub user_id: String,
    pub amount: f64,
    pub payout_type: String,
    pub payment_method: String,
    pub money_transaction_id: String,
    pub balance_after: f64,
    pub occurred_at: String,
}

fn default_payment_method() -> String {
    "CASH".to_owned()
}

fn positive_decimal(value: &Decimal) -> Result<(), validator::ValidationError> {
    if *value > Decimal::ZERO {
        Ok(())
    } else {
        Err(validator::ValidationError::new("positive_amount"))
    }
}
