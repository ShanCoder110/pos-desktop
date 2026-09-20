use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProductListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "category_id")]
    pub category_id: Option<String>,
    #[serde(alias = "product_type")]
    pub product_type: Option<String>,
    #[serde(alias = "in_stock")]
    pub in_stock: Option<bool>,
    #[serde(alias = "low_stock")]
    pub low_stock: Option<bool>,
    #[serde(alias = "min_price")]
    pub min_price: Option<Decimal>,
    #[serde(alias = "max_price")]
    pub max_price: Option<Decimal>,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ProductUnitInput {
    pub id: Option<String>,
    pub unit_id: String,
    #[validate(length(min = 1, max = 80))]
    pub name: String,
    #[validate(custom(function = "positive_decimal"))]
    pub contains: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub cost: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub min: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub wholesale: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub price: Decimal,
    pub barcode: Option<String>,
    #[serde(default)]
    pub is_base: bool,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct OpeningStockInput {
    pub branch_id: String,
    pub supplier_id: Option<String>,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub cost: Decimal,
    pub received_date: String,
    pub expiry_date: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[validate(schema(function = "validate_product"))]
#[serde(rename_all = "camelCase")]
pub struct CreateProductRequest {
    #[validate(length(min = 1, max = 160))]
    pub name: String,
    pub category_id: String,
    pub base_unit_id: String,
    #[serde(default)]
    pub created_by: Option<String>,
    #[validate(length(max = 64))]
    pub sku: Option<String>,
    #[validate(length(max = 128))]
    pub barcode: Option<String>,
    #[serde(default)]
    pub is_manufactured: bool,
    #[serde(default = "default_true")]
    pub track_lots: bool,
    #[serde(default)]
    pub track_expiry: bool,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub minimum_stock: Decimal,
    #[serde(default)]
    pub warranty_qty: Option<i32>,
    #[serde(default)]
    pub warranty_unit: Option<String>,
    #[serde(default)]
    pub warranty_note: Option<String>,
    #[validate(nested)]
    pub sell_units: Vec<ProductUnitInput>,
    #[validate(nested)]
    pub opening_stock: Option<OpeningStockInput>,
    #[validate(nested)]
    #[serde(default)]
    pub opening_stocks: Vec<OpeningStockInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductRequest {
    #[validate(length(min = 1, max = 160))]
    pub name: Option<String>,
    pub category_id: Option<String>,
    #[validate(custom(function = "non_negative_optional_decimal"))]
    pub minimum_stock: Option<Decimal>,
    pub warranty_qty: Option<i32>,
    pub warranty_unit: Option<String>,
    pub warranty_note: Option<String>,
    pub is_active: Option<bool>,
    #[validate(nested)]
    pub sell_units: Option<Vec<ProductUnitInput>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBranchStockResponse {
    pub branch_id: String,
    pub branch_name: String,
    pub quantity: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSellUnitResponse {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub contains: f64,
    pub cost: f64,
    pub min: f64,
    pub wholesale: f64,
    pub price: f64,
    pub barcode: String,
    pub is_base: bool,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductResponse {
    pub id: String,
    pub name: String,
    pub sku: String,
    pub barcode: String,
    pub category: String,
    pub category_id: String,
    pub unit: String,
    pub base_unit_id: String,
    pub supplier_id: Option<String>,
    pub minimum_stock: f64,
    pub is_linear: bool,
    pub is_manufactured: bool,
    pub pack_qty: Option<f64>,
    pub pack_price: f64,
    pub cost: f64,
    pub min: f64,
    pub wholesale: f64,
    pub retail: f64,
    pub warranty_enabled: bool,
    pub warranty_qty: i32,
    pub warranty_unit: String,
    pub warranty_days: i32,
    pub warranty_note: String,
    pub claims: i64,
    pub damaged: f64,
    pub stock: f64,
    pub total_stock: f64,
    pub branch_stock: Vec<ProductBranchStockResponse>,
    pub components: Vec<serde_json::Value>,
    pub sell_units: Vec<ProductSellUnitResponse>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProductSearchResponse {
    pub products: Vec<ProductResponse>,
}

const fn default_true() -> bool {
    true
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

fn validate_product(value: &CreateProductRequest) -> Result<(), ValidationError> {
    let base_count = value.sell_units.iter().filter(|unit| unit.is_base).count();
    let default_count = value
        .sell_units
        .iter()
        .filter(|unit| unit.is_default)
        .count();
    if value.sell_units.is_empty() || base_count != 1 || default_count > 1 {
        return Err(ValidationError::new("invalid_product_units"));
    }
    if value.sell_units.iter().any(|unit| {
        unit.min > unit.wholesale || unit.wholesale > unit.price || unit.cost > unit.min
    }) {
        return Err(ValidationError::new("invalid_price_order"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_price_order_that_can_lose_money() {
        let request = CreateProductRequest {
            name: "Cable".into(),
            category_id: uuid::Uuid::new_v4().to_string(),
            base_unit_id: uuid::Uuid::new_v4().to_string(),
            created_by: Some(uuid::Uuid::new_v4().to_string()),
            sku: None,
            barcode: None,
            is_manufactured: false,
            track_lots: true,
            track_expiry: false,
            minimum_stock: Decimal::ZERO,
            warranty_qty: None,
            warranty_unit: None,
            warranty_note: None,
            sell_units: vec![ProductUnitInput {
                id: None,
                unit_id: uuid::Uuid::new_v4().to_string(),
                name: "Meter".into(),
                contains: Decimal::ONE,
                cost: Decimal::new(10, 0),
                min: Decimal::new(9, 0),
                wholesale: Decimal::new(12, 0),
                price: Decimal::new(15, 0),
                barcode: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
            opening_stocks: vec![],
        };
        assert!(request.validate().is_err());
    }
}
