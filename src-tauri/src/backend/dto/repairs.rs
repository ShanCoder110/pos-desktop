use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RepairListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub status: Option<String>,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "customer_id")]
    pub customer_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateRepairRequest {
    pub customer_id: Option<String>,
    pub assigned_employee_id: Option<String>,
    #[validate(length(min = 1, max = 200))]
    pub item_name: String,
    #[validate(length(min = 1, max = 2000))]
    pub complaint: String,
    pub serial_number: Option<String>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub estimated_amount: Decimal,
    pub promised_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CompleteRepairRequest {
    pub diagnosis: Option<String>,
    pub work_notes: Option<String>,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub service_amount: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub discount: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub commission_amount: Decimal,
    #[serde(default)]
    #[validate(nested)]
    pub parts: Vec<RepairPartInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct RepairPartInput {
    pub product_id: String,
    pub product_unit_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub quantity: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    pub selling_price: Decimal,
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub waste_base_quantity: Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct DeliverRepairRequest {
    #[validate(custom(function = "non_negative_decimal"))]
    #[serde(default)]
    pub paid_amount: Decimal,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairPartResponse {
    pub id: String,
    pub product_id: String,
    pub product_unit_id: String,
    pub displayed_quantity: f64,
    pub base_quantity: f64,
    pub waste_base_quantity: f64,
    pub selling_price: f64,
    pub line_total: f64,
    pub fifo_cost: f64,
    pub waste_cost: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairResponse {
    pub id: String,
    pub branch_id: String,
    pub repair_number: String,
    pub customer_id: Option<String>,
    pub assigned_employee_id: Option<String>,
    pub item_name: String,
    pub complaint: String,
    pub serial_number: Option<String>,
    pub diagnosis: Option<String>,
    pub work_notes: Option<String>,
    pub status: String,
    pub payment_status: String,
    pub estimated_amount: f64,
    pub service_amount: f64,
    pub parts_amount: f64,
    pub discount: f64,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub credit_amount: f64,
    pub material_cost: f64,
    pub waste_cost: f64,
    pub commission_cost: f64,
    pub parts: Vec<RepairPartResponse>,
    pub received_at: String,
    pub ready_at: Option<String>,
    pub delivered_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
