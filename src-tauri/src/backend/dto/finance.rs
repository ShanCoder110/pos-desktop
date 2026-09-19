use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

use super::PageQuery;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategoryResponse {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateExpenseCategoryRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ExpenseListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    #[serde(alias = "category_id")]
    pub category_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateExpenseRequest {
    pub category_id: String,
    #[validate(custom(function = "positive_decimal"))]
    pub amount: Decimal,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,
    #[validate(length(min = 1, max = 500))]
    pub description: String,
    pub expense_date: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseResponse {
    pub id: String,
    pub branch_id: String,
    pub category_id: String,
    pub amount: f64,
    pub payment_method: String,
    pub description: String,
    pub expense_date: String,
    pub money_transaction_id: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TransactionListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
    pub direction: Option<String>,
    #[serde(alias = "type")]
    pub transaction_type: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyTransactionResponse {
    pub id: String,
    pub branch_id: String,
    pub cash_session_id: Option<String>,
    pub direction: String,
    pub transaction_type: String,
    pub amount: f64,
    pub payment_method: String,
    pub reference_type: String,
    pub reference_id: String,
    pub party_type: Option<String>,
    pub party_id: Option<String>,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardReportResponse {
    pub today_sales_total: f64,
    pub credit_outstanding: f64,
    pub low_stock_count: u64,
    pub open_repairs: u64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AnalyticsQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsDaySales {
    pub day: String,
    pub total: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsTopProduct {
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub revenue: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsReportResponse {
    pub sales_by_day: Vec<AnalyticsDaySales>,
    pub top_products: Vec<AnalyticsTopProduct>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationSettingsResponse {
    pub id: String,
    pub currency_symbol: String,
    pub currency_code: String,
    pub language: String,
    pub expiry_reminder_days: i32,
    pub payout_deduct_from: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLocalizationRequest {
    pub currency_symbol: Option<String>,
    pub currency_code: Option<String>,
    pub language: Option<String>,
    pub expiry_reminder_days: Option<i32>,
    pub payout_deduct_from: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptSettingsResponse {
    pub id: String,
    pub branch_id: String,
    pub paper_width: String,
    pub shop_name: String,
    pub header_display: String,
    pub show_logo: bool,
    pub tagline: Option<String>,
    pub contact_line: Option<String>,
    pub footer_note: Option<String>,
    pub show_customer_balance: bool,
    pub show_item_discount: bool,
    pub show_cashier_name: bool,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReceiptRequest {
    pub paper_width: Option<String>,
    pub shop_name: Option<String>,
    pub header_display: Option<String>,
    pub show_logo: Option<bool>,
    pub tagline: Option<String>,
    pub contact_line: Option<String>,
    pub footer_note: Option<String>,
    pub show_customer_balance: Option<bool>,
    pub show_item_discount: Option<bool>,
    pub show_cashier_name: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ReceiptSettingsQuery {
    #[serde(alias = "branch_id")]
    pub branch_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSettingsResponse {
    pub shop_name: String,
    pub branch_id: String,
    pub branch_name: String,
    pub branch_phone: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub shop_name: Option<String>,
    pub branch_name: Option<String>,
    pub branch_phone: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusResponse {
    pub enabled: bool,
    pub pending_mutations: u64,
}

fn default_payment_method() -> String {
    "CASH".into()
}

fn positive_decimal(value: &Decimal) -> Result<(), ValidationError> {
    (*value > Decimal::ZERO)
        .then_some(())
        .ok_or_else(|| ValidationError::new("must_be_positive"))
}
