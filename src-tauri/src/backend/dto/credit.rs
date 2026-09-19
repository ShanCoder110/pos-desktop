use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CustomerLedgerListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub customer: Option<String>,
    pub entry_type: Option<String>,
    pub debit: Option<f64>,
    pub credit: Option<f64>,
    pub occurred_from: Option<String>,
    pub occurred_to: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerEntryResponse {
    pub id: String,
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
    pub branch_id: String,
    pub entry_type: String,
    pub invoice_id: Option<String>,
    pub payment_id: Option<String>,
    pub return_id: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub balance_after: f64,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerResponse {
    pub customer_id: String,
    pub balance: f64,
    pub entries: Vec<CustomerLedgerEntryResponse>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentRequest {
    #[validate(custom(function = "positive_decimal"))]
    pub amount: Decimal,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
    pub client_request_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentResponse {
    pub id: String,
    pub customer_id: String,
    pub amount: f64,
    pub payment_method: String,
    pub money_transaction_id: String,
    pub balance_after: f64,
    pub occurred_at: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ReturnListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "invoice_id")]
    pub invoice_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_create_return"))]
#[serde(rename_all = "camelCase")]
pub struct CreateReturnRequest {
    pub invoice_id: String,
    pub return_type: String,
    #[validate(length(min = 1, max = 500))]
    pub reason: String,
    pub notes: Option<String>,
    #[validate(nested)]
    pub items: Vec<ReturnItemInput>,
    #[serde(default)]
    #[validate(nested)]
    pub replacements: Vec<ReplacementItemInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ReturnItemInput {
    pub invoice_item_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[serde(default = "default_condition")]
    pub condition: String,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub refund_amount: Decimal,
    pub original_product_lot_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementItemInput {
    pub product_id: String,
    pub product_unit_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub unit_price: Decimal,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnItemResponse {
    pub id: String,
    pub invoice_item_id: String,
    pub product_id: String,
    pub displayed_quantity: f64,
    pub base_quantity: f64,
    pub condition: String,
    pub refund_amount: f64,
    pub restock_action: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnResponse {
    pub id: String,
    pub return_number: String,
    pub invoice_id: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub return_type: String,
    pub status: String,
    pub reason: String,
    pub notes: Option<String>,
    pub refund_amount: f64,
    pub items: Vec<ReturnItemResponse>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ClaimListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    pub status: Option<String>,
    #[serde(alias = "customer_id")]
    pub customer_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_create_claim"))]
#[serde(rename_all = "camelCase")]
pub struct CreateClaimRequest {
    pub invoice_id: Option<String>,
    pub customer_id: Option<String>,
    pub supplier_id: Option<String>,
    #[validate(length(min = 1, max = 2000))]
    pub problem: String,
    pub diagnosis: Option<String>,
    pub assigned_to: Option<String>,
    #[validate(nested)]
    pub items: Vec<ClaimItemInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ClaimItemInput {
    pub invoice_item_id: Option<String>,
    pub product_id: String,
    pub product_lot_id: Option<String>,
    pub serial_number: Option<String>,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[serde(default = "default_condition")]
    pub condition: String,
    #[serde(default = "default_claim_action")]
    pub action: String,
    pub replacement_product_id: Option<String>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub cost: Decimal,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimItemResponse {
    pub id: String,
    pub product_id: String,
    pub product_lot_id: Option<String>,
    pub serial_number: Option<String>,
    pub quantity: f64,
    pub condition: String,
    pub action: String,
    pub cost: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimStatusHistoryResponse {
    pub id: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub notes: Option<String>,
    pub changed_by: String,
    pub changed_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResponse {
    pub id: String,
    pub claim_number: String,
    pub invoice_id: Option<String>,
    pub customer_id: Option<String>,
    pub branch_id: String,
    pub supplier_id: Option<String>,
    pub status: String,
    pub problem: String,
    pub diagnosis: Option<String>,
    pub resolution: Option<String>,
    pub items: Vec<ClaimItemResponse>,
    pub status_history: Vec<ClaimStatusHistoryResponse>,
    pub received_at: String,
    pub resolved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn default_payment_method() -> String {
    "CASH".into()
}

fn default_condition() -> String {
    "GOOD".into()
}

fn default_claim_action() -> String {
    "REPAIR".into()
}

fn positive_decimal(value: &Decimal) -> Result<(), ValidationError> {
    (*value > Decimal::ZERO)
        .then_some(())
        .ok_or_else(|| ValidationError::new("must_be_positive"))
}

fn non_negative_decimal(value: &Decimal) -> Result<(), ValidationError> {
    (*value >= Decimal::ZERO)
        .then_some(())
        .ok_or_else(|| ValidationError::new("must_be_non_negative"))
}

fn validate_create_return(value: &CreateReturnRequest) -> Result<(), ValidationError> {
    if value.items.is_empty() {
        return Err(ValidationError::new("empty_return"));
    }
    let kind = value.return_type.trim().to_uppercase();
    if kind != "REFUND" && kind != "REPLACEMENT" && kind != "CLAIM" {
        return Err(ValidationError::new("invalid_return_type"));
    }
    if kind == "REPLACEMENT" && value.replacements.is_empty() {
        return Err(ValidationError::new("replacements_required"));
    }
    Ok(())
}

fn validate_create_claim(value: &CreateClaimRequest) -> Result<(), ValidationError> {
    if value.items.is_empty() {
        return Err(ValidationError::new("empty_claim"));
    }
    Ok(())
}
