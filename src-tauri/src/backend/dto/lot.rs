use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize};
use validator::{Validate, ValidationError};

use crate::backend::constants::MAX_STOCK_COUNT_BASE_UNITS;

use super::PageQuery;

/// Patch field: absent = leave unchanged; null/"" = clear; string = set.
fn deserialize_patch_optional_string<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let inner = Option::<String>::deserialize(deserializer)?;
    Ok(Some(inner.and_then(|text| {
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })))
}

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
    #[serde(alias = "supplier_id")]
    pub supplier_id: Option<String>,
    pub city: Option<String>,
    pub lot_status: Option<String>,
    pub occurred_from: Option<String>,
    pub occurred_to: Option<String>,
    #[serde(alias = "min_value_left")]
    pub min_value_left: Option<Decimal>,
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
    pub original_quantity: Option<Decimal>,
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
    /// Absent = leave unchanged; `null`/empty = clear; date string = set.
    #[serde(default, deserialize_with = "deserialize_patch_optional_string")]
    pub expiry_date: Option<Option<String>>,
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
    /// Committed sales (SALE/REPLACEMENT/PRODUCTION/REPAIR − RETURN). Never residual.
    pub sold_base_quantity: f64,
    /// Stock-count / adjustment downs that are not sales (cost only — never revenue/profit).
    pub shrunk_base_quantity: f64,
    /// Realized sale revenue for this lot (COMPLETED invoices only).
    pub sold_revenue: f64,
    /// Realized sale profit for this lot (revenue − FIFO COGS). Shrinkage is not included.
    pub sold_profit: f64,
    /// Shrinkage at lot FIFO cost (qty × purchase_price_per_base).
    pub shrink_cost: f64,
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
    pub quantity_before: Option<f64>,
    pub quantity_after: Option<f64>,
    pub unit_cost: Option<f64>,
    pub total_cost: Option<f64>,
    pub reference_type: String,
    pub reference_id: String,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_by: String,
    pub created_at: String,
}

/// Count on-hand stock for one product at a branch, in any sell unit.
#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct StockCountRequest {
    pub product_id: String,
    #[serde(default)]
    pub branch_id: Option<String>,
    pub product_unit_id: String,
    /// Displayed count in the chosen sell unit (converted to base server-side).
    /// Rejects negatives; absolute cap is enforced on base units after conversion.
    #[validate(custom(function = "stock_count_display_quantity"))]
    pub counted_quantity: Decimal,
    /// Required reason, max 200 characters.
    #[validate(length(min = 1, max = 200))]
    pub reason: String,
    /// When true, also post a supplier ledger ADJUSTMENT (default off).
    #[serde(default)]
    pub adjust_supplier_payable: bool,
    pub supplier_id: Option<String>,
    pub supplier_amount: Option<Decimal>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockCountResponse {
    pub id: String,
    pub adjustment_number: String,
    pub product_id: String,
    pub branch_id: String,
    pub product_unit_id: String,
    pub displayed_unit_name: String,
    pub counted_quantity: f64,
    pub old_quantity: f64,
    pub new_quantity: f64,
    pub difference: f64,
    pub reason: String,
    pub movement_ids: Vec<String>,
    pub created_adjustment_lot_id: Option<String>,
    pub supplier_ledger_posted: bool,
    pub occurred_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockReconcileFix {
    pub product_id: String,
    pub product_name: String,
    pub lot_id: String,
    pub lot_number: String,
    pub lot_remaining: f64,
    pub branch_lots_before: f64,
    pub branch_lots_after: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockReconcileResponse {
    pub checked_products: u64,
    pub mismatched_before: u64,
    pub fixes: Vec<StockReconcileFix>,
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

/// Displayed counted qty: non-negative and not absurdly large before unit conversion.
fn stock_count_display_quantity(value: &Decimal) -> Result<(), ValidationError> {
    if *value < Decimal::ZERO {
        return Err(ValidationError::new("must_be_non_negative"));
    }
    // Cap display input at the base-unit max (1:1 units); pack conversion is
    // re-checked after to_base in the stock-count service.
    let max = Decimal::from(MAX_STOCK_COUNT_BASE_UNITS);
    if *value > max {
        return Err(ValidationError::new("stock_count_too_large"));
    }
    Ok(())
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
