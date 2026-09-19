use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TransferListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub status: Option<String>,
    #[serde(alias = "from_branch_id")]
    pub from_branch_id: Option<String>,
    #[serde(alias = "to_branch_id")]
    pub to_branch_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_create_transfer"))]
#[serde(rename_all = "camelCase")]
pub struct CreateTransferRequest {
    pub from_branch_id: String,
    pub to_branch_id: String,
    pub notes: Option<String>,
    #[validate(nested)]
    pub items: Vec<TransferItemInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct TransferItemInput {
    pub product_id: String,
    pub product_lot_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferItemResponse {
    pub id: String,
    pub product_id: String,
    pub product_lot_id: String,
    pub requested_base_quantity: f64,
    pub sent_base_quantity: f64,
    pub received_base_quantity: f64,
    pub damaged_in_transit_quantity: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResponse {
    pub id: String,
    pub transfer_number: String,
    pub from_branch_id: String,
    pub to_branch_id: String,
    pub status: String,
    pub notes: Option<String>,
    pub items: Vec<TransferItemResponse>,
    pub created_at: String,
    pub sent_at: Option<String>,
    pub received_at: Option<String>,
}

fn positive_decimal(value: &Decimal) -> Result<(), ValidationError> {
    (*value > Decimal::ZERO)
        .then_some(())
        .ok_or_else(|| ValidationError::new("must_be_positive"))
}

fn validate_create_transfer(value: &CreateTransferRequest) -> Result<(), ValidationError> {
    if value.items.is_empty() {
        return Err(ValidationError::new("empty_transfer"));
    }
    if value.from_branch_id.trim() == value.to_branch_id.trim() {
        return Err(ValidationError::new("same_branch"));
    }
    Ok(())
}
