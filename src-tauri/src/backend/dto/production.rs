use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProductionListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub status: Option<String>,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductionRequest {
    pub finished_product_id: String,
    pub employee_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub planned_output_quantity: Decimal,
    pub notes: Option<String>,
    #[serde(default)]
    #[validate(nested)]
    pub materials: Vec<ProductionMaterialInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ProductionMaterialInput {
    pub component_product_id: String,
    pub component_unit_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub expected_quantity: Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CompleteProductionRequest {
    #[validate(custom(function = "positive_decimal"))]
    pub actual_output_quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub labor_cost: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub commission_amount: Decimal,
    #[serde(default)]
    #[validate(nested)]
    pub materials: Vec<CompleteProductionMaterialInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CompleteProductionMaterialInput {
    pub component_product_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub actual_quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub waste_base_quantity: Decimal,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionMaterialResponse {
    pub id: String,
    pub component_product_id: String,
    pub component_unit_id: String,
    pub expected_quantity: f64,
    pub expected_base_quantity: f64,
    pub actual_quantity: f64,
    pub actual_base_quantity: f64,
    pub waste_base_quantity: f64,
    pub actual_fifo_cost: f64,
    pub waste_cost: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionResponse {
    pub id: String,
    pub production_number: String,
    pub branch_id: String,
    pub finished_product_id: String,
    pub employee_id: String,
    pub status: String,
    pub planned_output_quantity: f64,
    pub actual_output_quantity: f64,
    pub material_cost: f64,
    pub waste_cost: f64,
    pub labor_cost: f64,
    pub commission_cost: f64,
    pub total_cost: f64,
    pub cost_per_output_base: f64,
    pub notes: Option<String>,
    pub materials: Vec<ProductionMaterialResponse>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
