use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    dto::{
        BranchResponse, BranchSettingsResponse, DevicePrinterResponse, DeviceResponse, PageQuery,
        UserPermissionResponse, UserResponse,
    },
    errors::AppError,
    repositories::auth::AuthRepository,
};

#[derive(Debug, FromQueryResult)]
struct UserRow {
    id: Uuid,
    name: String,
    username: String,
    phone: Option<String>,
    email: Option<String>,
    role: String,
    default_branch_id: Option<Uuid>,
    is_active: bool,
    last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct BranchRow {
    id: Uuid,
    name: String,
    code: String,
    branch_type: String,
    phone: Option<String>,
    address: Option<String>,
    is_main: bool,
    is_active: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    settings_id: Option<Uuid>,
    allow_negative_stock: Option<bool>,
    require_confirmed_cross_branch_transfer: Option<bool>,
    fifo_enabled: Option<bool>,
    default_walk_in_customer_id: Option<Uuid>,
    invoice_prefix: Option<String>,
    repair_prefix: Option<String>,
    production_prefix: Option<String>,
    lot_prefix: Option<String>,
    sku_prefix: Option<String>,
    settings_created_at: Option<chrono::DateTime<chrono::Utc>>,
    settings_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, FromQueryResult)]
struct DeviceRow {
    id: Uuid,
    branch_id: Uuid,
    name: String,
    is_active: bool,
    last_seen_at: Option<chrono::DateTime<chrono::Utc>>,
    last_synced_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct DevicePrinterRow {
    id: Uuid,
    device_id: Uuid,
    branch_id: Uuid,
    printer_name: String,
    paper_width: String,
    font_size_pt: Option<i32>,
    auto_print_after_sale: bool,
    split_long_bill: bool,
    copies: i32,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

pub struct OrgRepository;

impl OrgRepository {
    pub async fn list_users(
        database: &DatabaseConnection,
        query: &PageQuery,
    ) -> Result<(Vec<UserResponse>, u64), AppError> {
        let (where_sql, values) = user_conditions(query);
        let total = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM users WHERE {where_sql}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);
        let sort = match query.sort_by.as_deref() {
            Some("username") => "username",
            Some("role") => "role",
            Some("createdAt") => "created_at",
            _ => "name",
        };
        let direction = query.sort_direction.unwrap_or_default().sql();
        let mut page_values = values;
        page_values.push((query.per_page as i64).into());
        page_values.push((query.offset() as i64).into());
        let rows = UserRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, name, username, phone, email, role, default_branch_id, is_active,
                        last_login_at, created_at, updated_at
                 FROM users WHERE {where_sql}
                 ORDER BY {sort} {direction}, id ASC
                 LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        let mut users = Vec::with_capacity(rows.len());
        for row in rows {
            let permissions = AuthRepository::list_permissions(database, row.id).await?;
            users.push(user_response(row, permissions));
        }
        Ok((users, total))
    }

    pub async fn find_user(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<UserResponse>, AppError> {
        AuthRepository::load_user_response(database, id).await
    }

    pub async fn create_user(
        database: &DatabaseConnection,
        id: Uuid,
        name: &str,
        username: &str,
        password_hash: &str,
        phone: Option<&str>,
        email: Option<&str>,
        role: &str,
        default_branch_id: Option<Uuid>,
        is_active: bool,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO users
                    (id, business_id, default_branch_id, name, username, password_hash, phone, email,
                     role, is_active, last_login_at, created_at, updated_at)
                 VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                [
                    id.into(),
                    default_branch_id.into(),
                    name.into(),
                    username.into(),
                    password_hash.into(),
                    phone.into(),
                    email.into(),
                    role.into(),
                    is_active.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn update_user(
        database: &DatabaseConnection,
        id: Uuid,
        name: &str,
        username: &str,
        password_hash: Option<&str>,
        phone: Option<&str>,
        email: Option<&str>,
        role: &str,
        default_branch_id: Option<Uuid>,
        is_active: bool,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, AppError> {
        let result = if let Some(password_hash) = password_hash {
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE users
                     SET name = ?, username = ?, password_hash = ?, phone = ?, email = ?, role = ?,
                         default_branch_id = ?, is_active = ?, updated_at = ?
                     WHERE id = ?",
                    [
                        name.into(),
                        username.into(),
                        password_hash.into(),
                        phone.into(),
                        email.into(),
                        role.into(),
                        default_branch_id.into(),
                        is_active.into(),
                        now.into(),
                        id.into(),
                    ],
                ))
                .await?
        } else {
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE users
                     SET name = ?, username = ?, phone = ?, email = ?, role = ?,
                         default_branch_id = ?, is_active = ?, updated_at = ?
                     WHERE id = ?",
                    [
                        name.into(),
                        username.into(),
                        phone.into(),
                        email.into(),
                        role.into(),
                        default_branch_id.into(),
                        is_active.into(),
                        now.into(),
                        id.into(),
                    ],
                ))
                .await?
        };
        Ok(result.rows_affected() > 0)
    }

    pub async fn replace_permissions(
        database: &DatabaseConnection,
        user_id: Uuid,
        permissions: &[(Uuid, &str, bool)],
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "DELETE FROM user_permissions WHERE user_id = ?",
                [user_id.into()],
            ))
            .await?;
        for (id, key, is_allowed) in permissions {
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO user_permissions
                        (id, user_id, permission_key, is_allowed, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        (*id).into(),
                        user_id.into(),
                        (*key).into(),
                        (*is_allowed).into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }
        Ok(())
    }

    pub async fn list_branches(
        database: &DatabaseConnection,
        query: &PageQuery,
    ) -> Result<(Vec<BranchResponse>, u64), AppError> {
        let (where_sql, values) = branch_conditions(query);
        let total = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM branches b WHERE {where_sql}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);
        let sort = match query.sort_by.as_deref() {
            Some("code") => "b.code",
            Some("createdAt") => "b.created_at",
            _ => "b.name",
        };
        let direction = query.sort_direction.unwrap_or_default().sql();
        let mut page_values = values;
        page_values.push((query.per_page as i64).into());
        page_values.push((query.offset() as i64).into());
        let rows = BranchRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "{} WHERE {where_sql} ORDER BY {sort} {direction}, b.id ASC LIMIT ? OFFSET ?",
                branch_projection()
            ),
            page_values,
        ))
        .all(database)
        .await?;
        Ok((rows.into_iter().map(Into::into).collect(), total))
    }

    pub async fn find_branch(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<BranchResponse>, AppError> {
        Ok(BranchRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("{} WHERE b.id = ? AND b.deleted_at IS NULL LIMIT 1", branch_projection()),
            [id.into()],
        ))
        .one(database)
        .await?
        .map(Into::into))
    }

    pub async fn clear_main_branch(
        database: &DatabaseConnection,
        except_id: Option<Uuid>,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        if let Some(except_id) = except_id {
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE branches SET is_main = 0, updated_at = ?
                     WHERE is_main = 1 AND id != ? AND deleted_at IS NULL",
                    [now.into(), except_id.into()],
                ))
                .await?;
        } else {
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE branches SET is_main = 0, updated_at = ?
                     WHERE is_main = 1 AND deleted_at IS NULL",
                    [now.into()],
                ))
                .await?;
        }
        Ok(())
    }

    pub async fn create_branch(
        database: &DatabaseConnection,
        id: Uuid,
        name: &str,
        code: &str,
        branch_type: &str,
        phone: Option<&str>,
        address: Option<&str>,
        is_main: bool,
        is_active: bool,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO branches
                    (id, name, code, type, phone, address, is_main, is_active, version,
                     deleted_at, origin_device_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)",
                [
                    id.into(),
                    name.into(),
                    code.into(),
                    branch_type.into(),
                    phone.into(),
                    address.into(),
                    is_main.into(),
                    is_active.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn update_branch(
        database: &DatabaseConnection,
        id: Uuid,
        name: &str,
        code: &str,
        branch_type: &str,
        phone: Option<&str>,
        address: Option<&str>,
        is_main: bool,
        is_active: bool,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, AppError> {
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branches
                 SET name = ?, code = ?, type = ?, phone = ?, address = ?, is_main = ?,
                     is_active = ?, version = version + 1, updated_at = ?
                 WHERE id = ? AND deleted_at IS NULL",
                [
                    name.into(),
                    code.into(),
                    branch_type.into(),
                    phone.into(),
                    address.into(),
                    is_main.into(),
                    is_active.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn upsert_branch_settings(
        database: &DatabaseConnection,
        settings_id: Uuid,
        branch_id: Uuid,
        allow_negative_stock: bool,
        require_confirmed_cross_branch_transfer: bool,
        fifo_enabled: bool,
        default_walk_in_customer_id: Option<Uuid>,
        invoice_prefix: &str,
        repair_prefix: &str,
        production_prefix: &str,
        lot_prefix: &str,
        sku_prefix: &str,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO branch_settings
                    (id, branch_id, allow_negative_stock, require_confirmed_cross_branch_transfer,
                     fifo_enabled, default_walk_in_customer_id, invoice_prefix, repair_prefix,
                     production_prefix, lot_prefix, sku_prefix, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(branch_id) DO UPDATE SET
                    allow_negative_stock = excluded.allow_negative_stock,
                    require_confirmed_cross_branch_transfer = excluded.require_confirmed_cross_branch_transfer,
                    fifo_enabled = excluded.fifo_enabled,
                    default_walk_in_customer_id = excluded.default_walk_in_customer_id,
                    invoice_prefix = excluded.invoice_prefix,
                    repair_prefix = excluded.repair_prefix,
                    production_prefix = excluded.production_prefix,
                    lot_prefix = excluded.lot_prefix,
                    sku_prefix = excluded.sku_prefix,
                    updated_at = excluded.updated_at",
                [
                    settings_id.into(),
                    branch_id.into(),
                    allow_negative_stock.into(),
                    require_confirmed_cross_branch_transfer.into(),
                    fifo_enabled.into(),
                    default_walk_in_customer_id.into(),
                    invoice_prefix.into(),
                    repair_prefix.into(),
                    production_prefix.into(),
                    lot_prefix.into(),
                    sku_prefix.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn list_devices(
        database: &DatabaseConnection,
        query: &PageQuery,
        branch_id: Option<Uuid>,
    ) -> Result<(Vec<DeviceResponse>, u64), AppError> {
        let mut where_sql = String::from("1 = 1");
        let mut values: Vec<sea_orm::Value> = Vec::new();
        if let Some(search) = query.search.as_deref() {
            where_sql.push_str(" AND name LIKE ?");
            values.push(format!("%{search}%").into());
        }
        if let Some(is_active) = query.is_active {
            where_sql.push_str(" AND is_active = ?");
            values.push(is_active.into());
        }
        if let Some(branch_id) = branch_id {
            where_sql.push_str(" AND branch_id = ?");
            values.push(branch_id.into());
        }
        let total = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM devices WHERE {where_sql}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);
        let direction = query.sort_direction.unwrap_or_default().sql();
        let mut page_values = values;
        page_values.push((query.per_page as i64).into());
        page_values.push((query.offset() as i64).into());
        let rows = DeviceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, branch_id, name, is_active, last_seen_at, last_synced_at, created_at, updated_at
                 FROM devices WHERE {where_sql}
                 ORDER BY name {direction}, id ASC
                 LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        Ok((rows.into_iter().map(Into::into).collect(), total))
    }

    pub async fn find_device(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<DeviceResponse>, AppError> {
        Ok(DeviceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, branch_id, name, is_active, last_seen_at, last_synced_at, created_at, updated_at
             FROM devices WHERE id = ? LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?
        .map(Into::into))
    }

    pub async fn touch_device_seen(
        database: &DatabaseConnection,
        id: Uuid,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?",
                [now.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn get_device_printer(
        database: &DatabaseConnection,
        device_id: Uuid,
    ) -> Result<Option<DevicePrinterResponse>, AppError> {
        Ok(
            DevicePrinterRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, device_id, branch_id, printer_name, paper_width, font_size_pt,
                        auto_print_after_sale, split_long_bill, copies, created_at, updated_at
                 FROM device_printers WHERE device_id = ? LIMIT 1",
                [device_id.into()],
            ))
            .one(database)
            .await?
            .map(Into::into),
        )
    }

    pub async fn upsert_device_printer(
        database: &DatabaseConnection,
        id: Uuid,
        device_id: Uuid,
        branch_id: Uuid,
        printer_name: &str,
        paper_width: &str,
        font_size_pt: Option<i32>,
        auto_print_after_sale: bool,
        split_long_bill: bool,
        copies: i32,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO device_printers
                    (id, device_id, branch_id, printer_name, paper_width, font_size_pt,
                     auto_print_after_sale, split_long_bill, copies, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(device_id) DO UPDATE SET
                    branch_id = excluded.branch_id,
                    printer_name = excluded.printer_name,
                    paper_width = excluded.paper_width,
                    font_size_pt = excluded.font_size_pt,
                    auto_print_after_sale = excluded.auto_print_after_sale,
                    split_long_bill = excluded.split_long_bill,
                    copies = excluded.copies,
                    updated_at = excluded.updated_at",
                [
                    id.into(),
                    device_id.into(),
                    branch_id.into(),
                    printer_name.into(),
                    paper_width.into(),
                    font_size_pt.into(),
                    auto_print_after_sale.into(),
                    split_long_bill.into(),
                    copies.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }
}

impl From<BranchRow> for BranchResponse {
    fn from(row: BranchRow) -> Self {
        let settings = match (
            row.settings_id,
            row.allow_negative_stock,
            row.require_confirmed_cross_branch_transfer,
            row.fifo_enabled,
            row.invoice_prefix.clone(),
            row.repair_prefix.clone(),
            row.production_prefix.clone(),
            row.lot_prefix.clone(),
            row.sku_prefix.clone(),
            row.settings_created_at,
            row.settings_updated_at,
        ) {
            (
                Some(settings_id),
                Some(allow_negative_stock),
                Some(require_confirmed_cross_branch_transfer),
                Some(fifo_enabled),
                Some(invoice_prefix),
                Some(repair_prefix),
                Some(production_prefix),
                Some(lot_prefix),
                Some(sku_prefix),
                Some(settings_created_at),
                Some(settings_updated_at),
            ) => Some(BranchSettingsResponse {
                id: settings_id.to_string(),
                branch_id: row.id.to_string(),
                allow_negative_stock,
                require_confirmed_cross_branch_transfer,
                fifo_enabled,
                default_walk_in_customer_id: row
                    .default_walk_in_customer_id
                    .map(|value| value.to_string()),
                invoice_prefix,
                repair_prefix,
                production_prefix,
                lot_prefix,
                sku_prefix,
                created_at: settings_created_at.to_rfc3339(),
                updated_at: settings_updated_at.to_rfc3339(),
            }),
            _ => None,
        };
        Self {
            id: row.id.to_string(),
            name: row.name,
            code: row.code,
            branch_type: row.branch_type,
            phone: row.phone,
            address: row.address,
            is_main: row.is_main,
            is_active: row.is_active,
            settings,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<DeviceRow> for DeviceResponse {
    fn from(row: DeviceRow) -> Self {
        Self {
            id: row.id.to_string(),
            branch_id: row.branch_id.to_string(),
            name: row.name,
            is_active: row.is_active,
            last_seen_at: row.last_seen_at.map(|value| value.to_rfc3339()),
            last_synced_at: row.last_synced_at.map(|value| value.to_rfc3339()),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<DevicePrinterRow> for DevicePrinterResponse {
    fn from(row: DevicePrinterRow) -> Self {
        Self {
            id: row.id.to_string(),
            device_id: row.device_id.to_string(),
            branch_id: row.branch_id.to_string(),
            printer_name: row.printer_name,
            paper_width: row.paper_width,
            font_size_pt: row.font_size_pt,
            auto_print_after_sale: row.auto_print_after_sale,
            split_long_bill: row.split_long_bill,
            copies: row.copies,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

fn user_response(row: UserRow, permissions: Vec<UserPermissionResponse>) -> UserResponse {
    UserResponse {
        id: row.id.to_string(),
        name: row.name,
        username: row.username,
        phone: row.phone,
        email: row.email,
        role: row.role,
        default_branch_id: row.default_branch_id.map(|value| value.to_string()),
        is_active: row.is_active,
        last_login_at: row.last_login_at.map(|value| value.to_rfc3339()),
        permissions,
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn user_conditions(query: &PageQuery) -> (String, Vec<sea_orm::Value>) {
    let mut where_sql = String::from("1 = 1");
    let mut values = Vec::new();
    if let Some(search) = query.search.as_deref() {
        where_sql.push_str(" AND (name LIKE ? OR username LIKE ? OR role LIKE ?)");
        let pattern = format!("%{search}%");
        values.push(pattern.clone().into());
        values.push(pattern.clone().into());
        values.push(pattern.into());
    }
    if let Some(is_active) = query.is_active {
        where_sql.push_str(" AND is_active = ?");
        values.push(is_active.into());
    }
    (where_sql, values)
}

fn branch_conditions(query: &PageQuery) -> (String, Vec<sea_orm::Value>) {
    let mut where_sql = String::from("b.deleted_at IS NULL");
    let mut values = Vec::new();
    if let Some(search) = query.search.as_deref() {
        where_sql.push_str(" AND (b.name LIKE ? OR b.code LIKE ?)");
        let pattern = format!("%{search}%");
        values.push(pattern.clone().into());
        values.push(pattern.into());
    }
    if let Some(is_active) = query.is_active {
        where_sql.push_str(" AND b.is_active = ?");
        values.push(is_active.into());
    }
    (where_sql, values)
}

fn branch_projection() -> &'static str {
    "SELECT b.id, b.name, b.code, b.type AS branch_type, b.phone, b.address, b.is_main, b.is_active,
            b.created_at, b.updated_at,
            s.id AS settings_id, s.allow_negative_stock, s.require_confirmed_cross_branch_transfer,
            s.fifo_enabled, s.default_walk_in_customer_id, s.invoice_prefix, s.repair_prefix,
            s.production_prefix, s.lot_prefix, s.sku_prefix,
            s.created_at AS settings_created_at, s.updated_at AS settings_updated_at
     FROM branches b
     LEFT JOIN branch_settings s ON s.branch_id = b.id"
}
