use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_complete_sale"))]
#[serde(rename_all = "camelCase")]
pub struct CompleteSaleRequest {
    #[validate(length(min = 1, max = 120))]
    pub client_request_id: String,
    pub customer_id: Option<String>,
    #[validate(nested)]
    pub items: Vec<SaleItemInput>,
    #[validate(nested)]
    pub payments: Vec<SalePaymentInput>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub discount: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub tax: Decimal,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemInput {
    pub product_id: String,
    pub product_unit_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub unit_price: Decimal,
    #[serde(default = "default_price_mode")]
    pub price_mode: String,
    #[serde(default)]
    pub sold_below_minimum: bool,
    pub authorized_by: Option<String>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub discount: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub tax: Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SalePaymentInput {
    #[validate(custom(function = "positive_decimal"))]
    pub amount: Decimal,
    pub amount_tendered: Option<Decimal>,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
    pub client_request_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct InvoiceListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "customer_id")]
    pub customer_id: Option<String>,
    pub status: Option<String>,
    #[serde(alias = "payment_status")]
    pub payment_status: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceItemResponse {
    pub id: String,
    pub product_id: String,
    pub product_unit_id: Option<String>,
    pub product_name: String,
    pub sku: String,
    pub unit_name: String,
    pub displayed_quantity: f64,
    pub conversion_to_base: f64,
    pub base_quantity: f64,
    pub unit_price: f64,
    pub minimum_price_snapshot: f64,
    pub price_mode: String,
    pub sold_below_minimum: bool,
    pub authorized_by: Option<String>,
    pub discount: f64,
    pub tax: f64,
    pub line_total: f64,
    pub fifo_cost: f64,
    pub gross_profit: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoicePaymentResponse {
    pub id: String,
    pub amount: f64,
    pub amount_tendered: Option<f64>,
    pub change_amount: f64,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub status: String,
    pub paid_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceResponse {
    pub id: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub invoice_number: String,
    pub status: String,
    pub payment_status: String,
    pub subtotal: f64,
    pub discount: f64,
    pub tax: f64,
    pub total: f64,
    pub paid_amount: f64,
    pub credit_amount: f64,
    pub change_amount: f64,
    pub notes: Option<String>,
    pub cashier_name: String,
    pub client_request_id: String,
    pub items: Vec<InvoiceItemResponse>,
    pub payments: Vec<InvoicePaymentResponse>,
    pub completed_at: Option<String>,
    pub void_reason: Option<String>,
    pub voided_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct HoldRequest {
    #[validate(length(min = 1, max = 120))]
    pub label: String,
    pub customer_id: Option<String>,
    pub payload: serde_json::Value,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldResponse {
    pub id: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub label: String,
    pub payload: serde_json::Value,
    pub held_by: String,
    pub held_at: String,
    pub expires_at: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct VoidRequest {
    #[validate(length(min = 1, max = 500))]
    pub reason: String,
}

fn default_price_mode() -> String {
    "RETAIL".into()
}

fn default_payment_method() -> String {
    "CASH".into()
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

fn validate_complete_sale(value: &CompleteSaleRequest) -> Result<(), ValidationError> {
    if value.items.is_empty() {
        return Err(ValidationError::new("empty_sale"));
    }
    for item in &value.items {
        if item.sold_below_minimum
            && item
                .authorized_by
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .is_none()
        {
            return Err(ValidationError::new("below_minimum_unauthorized"));
        }
        let mode = item.price_mode.trim().to_uppercase();
        if mode != "RETAIL" && mode != "WHOLESALE" {
            return Err(ValidationError::new("invalid_price_mode"));
        }
    }
    Ok(())
}
