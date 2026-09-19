use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SupplierLedgerListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub supplier: Option<String>,
    pub entry_type: Option<String>,
    pub debit: Option<f64>,
    pub credit: Option<f64>,
    pub occurred_from: Option<String>,
    pub occurred_to: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PurchaseOrderListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "supplier_id")]
    pub supplier_id: Option<String>,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_create_po"))]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseOrderRequest {
    pub supplier_id: String,
    pub order_date: Option<String>,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    #[validate(nested)]
    pub items: Vec<PurchaseOrderItemInput>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub discount: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub tax: Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderItemInput {
    pub product_id: String,
    pub unit_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub unit_cost: Decimal,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseOrderRequest {
    pub received_date: Option<String>,
    pub supplier_invoice_number: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    #[validate(nested)]
    pub items: Vec<ReceivePurchaseOrderItemInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseOrderItemInput {
    pub purchase_order_item_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    pub expiry_date: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderItemResponse {
    pub id: String,
    pub product_id: String,
    pub unit_id: String,
    pub unit_name: String,
    pub ordered_quantity: f64,
    pub ordered_base_quantity: f64,
    pub expected_unit_cost: f64,
    pub received_base_quantity: f64,
    pub line_total: f64,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderResponse {
    pub id: String,
    pub branch_id: String,
    pub supplier_id: String,
    pub order_number: String,
    pub status: String,
    pub order_date: String,
    pub expected_date: Option<String>,
    pub subtotal: f64,
    pub discount: f64,
    pub tax: f64,
    pub total: f64,
    pub notes: Option<String>,
    pub items: Vec<PurchaseOrderItemResponse>,
    pub ordered_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierLedgerEntryResponse {
    pub id: String,
    pub supplier_id: String,
    pub supplier_name: Option<String>,
    pub branch_id: String,
    pub entry_type: String,
    pub purchase_order_id: Option<String>,
    pub goods_receipt_id: Option<String>,
    pub money_transaction_id: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub balance_after: f64,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPaymentRequest {
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
pub struct SupplierPaymentResponse {
    pub id: String,
    pub supplier_id: String,
    pub amount: f64,
    pub payment_method: String,
    pub money_transaction_id: String,
    pub balance_after: f64,
    pub occurred_at: String,
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

fn validate_create_po(value: &CreatePurchaseOrderRequest) -> Result<(), ValidationError> {
    if value.items.is_empty() {
        return Err(ValidationError::new("empty_po"));
    }
    Ok(())
}
