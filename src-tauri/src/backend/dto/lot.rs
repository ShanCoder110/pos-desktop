use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LotListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "product_id")]
    pub product_id: Option<String>,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "source_type")]
    pub source_type: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct BranchAllocationInput {
    pub branch_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: rust_decimal::Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_receive_lot"))]
#[serde(rename_all = "camelCase")]
pub struct ReceiveLotRequest {
    pub product_id: String,
    pub branch_id: Option<String>,
    #[validate(nested)]
    #[serde(default)]
    pub branch_allocations: Vec<BranchAllocationInput>,
    pub supplier_id: Option<String>,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub cost: Decimal,
    pub received_date: String,
    pub expiry_date: Option<String>,
    pub source_type: String,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub min: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub wholesale: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub retail: Option<Decimal>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub damaged_quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub paid_now: Decimal,
    pub purchase_order_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchLotResponse {
    pub id: String,
    pub branch_id: String,
    pub product_lot_id: String,
    pub allocated_base_quantity: f64,
    pub remaining_base_quantity: f64,
    pub reserved_base_quantity: f64,
    pub damaged_base_quantity: f64,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLotRequest {
    pub supplier_id: Option<String>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub remaining_quantity: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub damaged_quantity: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub cost: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub min: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub wholesale: Option<Decimal>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub retail: Option<Decimal>,
    #[validate(nested)]
    #[serde(default)]
    pub branch_allocations: Vec<BranchAllocationInput>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LotResponse {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub supplier_id: Option<String>,
    pub lot_number: String,
    pub source_type: String,
    pub original_base_quantity: f64,
    pub remaining_base_quantity: f64,
    pub damaged_base_quantity: f64,
    pub purchase_price_per_base: f64,
    pub received_date: String,
    pub expiry_date: Option<String>,
    pub branch_lots: Vec<BranchLotResponse>,
    pub purchase_order_id: Option<String>,
    pub purchase_order_number: Option<String>,
    pub purchase_order_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockRow {
    pub product_id: String,
    pub product_name: String,
    pub sku: String,
    pub barcode: String,
    pub unit: String,
    pub branch_id: String,
    pub remaining: f64,
    pub reserved: f64,
    pub damaged: f64,
    pub minimum_stock: f64,
    pub is_low: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StockListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "product_id")]
    pub product_id: Option<String>,
    #[serde(alias = "low_stock")]
    pub low_stock: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StockMovementListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "product_id")]
    pub product_id: Option<String>,
    #[serde(alias = "movement_type", alias = "type")]
    pub movement_type: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovementResponse {
    pub id: String,
    pub branch_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_lot_id: Option<String>,
    pub movement_type: String,
    pub displayed_quantity: f64,
    pub displayed_unit_name: String,
    pub base_quantity_delta: f64,
    pub unit_cost: Option<f64>,
    pub total_cost: Option<f64>,
    pub reference_type: String,
    pub reference_id: String,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_by: String,
    pub created_at: String,
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

fn non_negative_optional_decimal(value: &Decimal) -> Result<(), ValidationError> {
    non_negative_decimal(value)
}

fn validate_receive_lot(value: &ReceiveLotRequest) -> Result<(), ValidationError> {
    let source = value.source_type.trim().to_uppercase();
    if source != "OPENING" && source != "PURCHASE" {
        return Err(ValidationError::new("invalid_source_type"));
    }
    if source == "PURCHASE"
        && value
            .supplier_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .is_none()
    {
        return Err(ValidationError::new("supplier_required"));
    }
    if !value.branch_allocations.is_empty() {
        let total = value
            .branch_allocations
            .iter()
            .fold(rust_decimal::Decimal::ZERO, |sum, row| sum + row.quantity);
        if total != value.quantity {
            return Err(ValidationError::new(
                "branch_allocations_must_equal_quantity",
            ));
        }
    }
    if value.damaged_quantity > value.quantity {
        return Err(ValidationError::new("damaged_exceeds_quantity"));
    }
    Ok(())
}
