use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use validator::Validate;

use super::PageQuery;

#[derive(Clone, Debug, Deserialize, Validate, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1, max = 200))]
    pub password: String,
    pub device_id: String,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub expires_at: String,
    pub refresh_token: String,
    pub refresh_expires_at: String,
    pub user: UserResponse,
    pub branch_id: String,
    pub device_id: String,
    pub cash_session_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub needs_setup: bool,
    pub shop_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Validate, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SetupRequest {
    #[validate(length(min = 1, max = 120))]
    pub shop_name: String,
    #[validate(length(min = 1, max = 500))]
    pub address: String,
    #[validate(length(min = 1, max = 120))]
    pub owner_name: String,
    #[validate(length(min = 1, max = 80))]
    pub username: String,
    #[validate(length(min = 6, max = 200))]
    pub password: String,
    #[validate(length(min = 1, max = 32))]
    #[serde(default)]
    pub phone: Option<String>,
    #[validate(email)]
    #[serde(default)]
    pub email: Option<String>,
    pub device_id: String,
    #[validate(length(min = 1, max = 120))]
    #[serde(default)]
    pub device_name: Option<String>,
    #[validate(length(max = 200))]
    #[serde(default)]
    pub tagline: Option<String>,
    #[validate(length(max = 200))]
    #[serde(default)]
    pub contact_line: Option<String>,
    #[serde(default)]
    pub show_logo: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Validate, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
    pub device_id: String,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub user: UserResponse,
    pub session_id: String,
    pub branch_id: String,
    pub device_id: String,
    pub device_name: Option<String>,
    pub cash_session_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LogoutResponse {
    pub revoked: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UserListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub role: Option<String>,
    pub staff_only: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UserRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
    #[validate(length(min = 1, max = 80))]
    pub username: String,
    #[validate(length(min = 6, max = 200))]
    #[serde(default)]
    pub password: Option<String>,
    #[validate(length(max = 32))]
    #[serde(default)]
    pub phone: Option<String>,
    #[validate(email)]
    #[serde(default)]
    pub email: Option<String>,
    #[validate(length(min = 1, max = 32))]
    pub role: String,
    pub default_branch_id: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub permissions: Option<Vec<UserPermissionInput>>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UserPermissionInput {
    #[validate(length(min = 1, max = 80))]
    pub permission_key: String,
    #[serde(default)]
    pub is_allowed: bool,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct UserPermissionResponse {
    pub id: String,
    pub permission_key: String,
    pub is_allowed: bool,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "auth/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: String,
    pub name: String,
    pub username: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub role: String,
    pub default_branch_id: Option<String>,
    pub is_active: bool,
    pub last_login_at: Option<String>,
    pub permissions: Vec<UserPermissionResponse>,
    pub total_paid: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct BranchRequest {
    #[validate(length(min = 1, max = 120))]
    pub name: String,
    #[validate(length(min = 1, max = 32))]
    pub code: String,
    #[serde(rename = "type")]
    #[validate(length(min = 1, max = 32))]
    pub branch_type: String,
    #[validate(length(max = 32))]
    #[serde(default)]
    pub phone: Option<String>,
    #[validate(length(max = 500))]
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub is_main: bool,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub settings: Option<BranchSettingsInput>,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct BranchSettingsInput {
    #[serde(default)]
    pub allow_negative_stock: Option<bool>,
    #[serde(default)]
    pub require_confirmed_cross_branch_transfer: Option<bool>,
    #[serde(default)]
    pub fifo_enabled: Option<bool>,
    #[serde(default)]
    pub default_walk_in_customer_id: Option<String>,
    #[validate(length(max = 16))]
    #[serde(default)]
    pub invoice_prefix: Option<String>,
    #[validate(length(max = 16))]
    #[serde(default)]
    pub repair_prefix: Option<String>,
    #[validate(length(max = 16))]
    #[serde(default)]
    pub production_prefix: Option<String>,
    #[validate(length(max = 16))]
    #[serde(default)]
    pub lot_prefix: Option<String>,
    #[validate(length(max = 16))]
    #[serde(default)]
    pub sku_prefix: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSettingsResponse {
    pub id: String,
    pub branch_id: String,
    pub allow_negative_stock: bool,
    pub require_confirmed_cross_branch_transfer: bool,
    pub fifo_enabled: bool,
    pub default_walk_in_customer_id: Option<String>,
    pub invoice_prefix: String,
    pub repair_prefix: String,
    pub production_prefix: String,
    pub lot_prefix: String,
    pub sku_prefix: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchResponse {
    pub id: String,
    pub name: String,
    pub code: String,
    #[serde(rename = "type")]
    pub branch_type: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub is_main: bool,
    pub is_active: bool,
    pub settings: Option<BranchSettingsResponse>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceResponse {
    pub id: String,
    pub branch_id: String,
    pub name: String,
    pub is_active: bool,
    pub last_seen_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct DevicePrinterRequest {
    #[validate(length(min = 1, max = 120))]
    pub printer_name: String,
    #[validate(length(min = 1, max = 16))]
    #[serde(default = "default_paper_width")]
    pub paper_width: String,
    #[serde(default)]
    pub font_size_pt: Option<i32>,
    #[serde(default)]
    pub auto_print_after_sale: bool,
    #[serde(default)]
    pub split_long_bill: bool,
    #[serde(default = "default_copies")]
    pub copies: i32,
}

fn default_paper_width() -> String {
    "MM_80".to_owned()
}

const fn default_copies() -> i32 {
    1
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePrinterResponse {
    pub id: String,
    pub device_id: String,
    pub branch_id: String,
    pub printer_name: String,
    pub paper_width: String,
    pub font_size_pt: Option<i32>,
    pub auto_print_after_sale: bool,
    pub split_long_bill: bool,
    pub copies: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CashSessionOpenRequest {
    pub opening_float: Decimal,
}

#[derive(Clone, Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CashSessionCloseRequest {
    pub counted_cash: Decimal,
    #[validate(length(max = 1_000))]
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSessionResponse {
    pub id: String,
    pub branch_id: String,
    pub device_id: String,
    pub cashier_id: String,
    pub status: String,
    pub opening_float: f64,
    pub expected_cash: Option<f64>,
    pub counted_cash: Option<f64>,
    pub variance: Option<f64>,
    pub notes: Option<String>,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const fn default_true() -> bool {
    true
}
