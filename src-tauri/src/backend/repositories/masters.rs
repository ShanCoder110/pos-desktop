use rust_decimal::prelude::ToPrimitive;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    dto::{MasterRequest, MasterResponse, PageQuery},
    errors::AppError,
};

#[derive(Clone, Copy)]
pub enum MasterKind {
    Category,
    Unit,
    Supplier,
    Customer,
}

impl MasterKind {
    const fn table(self) -> &'static str {
        match self {
            Self::Category => "product_categories",
            Self::Unit => "units",
            Self::Supplier => "suppliers",
            Self::Customer => "customers",
        }
    }

    const fn projection(self) -> &'static str {
        match self {
            Self::Category => "id, name, NULL AS symbol, NULL AS phone, NULL AS email, NULL AS address, description AS notes, is_active, NULL AS precision, NULL AS credit_limit, NULL AS payment_terms_days, NULL AS is_walk_in, created_at, updated_at",
            Self::Unit => "id, name, symbol, NULL AS phone, NULL AS email, NULL AS address, NULL AS notes, is_active, precision, NULL AS credit_limit, NULL AS payment_terms_days, NULL AS is_walk_in, created_at, updated_at",
            Self::Supplier => "id, name, NULL AS symbol, phone, email, address, notes, is_active, NULL AS precision, credit_limit, payment_terms_days, NULL AS is_walk_in, created_at, updated_at",
            Self::Customer => "id, name, NULL AS symbol, phone, email, address, notes, is_active, NULL AS precision, credit_limit, NULL AS payment_terms_days, is_walk_in, created_at, updated_at",
        }
    }
}

#[derive(Debug, FromQueryResult)]
struct MasterRow {
    id: Uuid,
    name: String,
    symbol: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    address: Option<String>,
    notes: Option<String>,
    is_active: bool,
    precision: Option<i16>,
    credit_limit: Option<rust_decimal::Decimal>,
    payment_terms_days: Option<i32>,
    is_walk_in: Option<bool>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

impl From<MasterRow> for MasterResponse {
    fn from(row: MasterRow) -> Self {
        Self {
            id: row.id.to_string(),
            name: row.name,
            symbol: row.symbol,
            phone: row.phone,
            email: row.email,
            address: row.address,
            notes: row.notes,
            is_active: row.is_active,
            precision: row.precision,
            credit_limit: row.credit_limit.and_then(|value| value.to_f64()),
            payment_terms_days: row.payment_terms_days,
            is_walk_in: row.is_walk_in,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

pub struct MasterRepository;

impl MasterRepository {
    pub async fn list(
        database: &DatabaseConnection,
        kind: MasterKind,
        query: &PageQuery,
    ) -> Result<(Vec<MasterResponse>, u64), AppError> {
        let (where_sql, values) = conditions(kind, query);
        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM {} WHERE {where_sql}",
            kind.table()
        );
        let total = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);
        let sort = match query.sort_by.as_deref() {
            Some("createdAt") => "created_at",
            Some("updatedAt") => "updated_at",
            _ => "name",
        };
        let direction = query.sort_direction.unwrap_or_default().sql();
        let sql = format!(
            "SELECT {} FROM {} WHERE {where_sql} ORDER BY {sort} {direction}, id ASC LIMIT ? OFFSET ?",
            kind.projection(),
            kind.table()
        );
        let mut page_values = values;
        page_values.push((query.per_page as i64).into());
        page_values.push((query.offset() as i64).into());
        let rows = MasterRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;
        Ok((rows.into_iter().map(Into::into).collect(), total))
    }

    pub async fn find(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
    ) -> Result<Option<MasterResponse>, AppError> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            kind.projection(),
            kind.table()
        );
        Ok(MasterRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            [id.into()],
        ))
        .one(database)
        .await?
        .map(Into::into))
    }

    pub async fn create(
        database: &DatabaseConnection,
        kind: MasterKind,
        request: &MasterRequest,
    ) -> Result<MasterResponse, AppError> {
        let id = Uuid::new_v4();
        let now = chrono::Utc::now();
        let (sql, values) = insert_statement(kind, id, now, request);
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                values,
            ))
            .await?;
        Self::find(database, kind, id)
            .await?
            .ok_or_else(|| AppError::internal("created master record could not be read"))
    }

    pub async fn update(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        request: &MasterRequest,
    ) -> Result<Option<MasterResponse>, AppError> {
        if Self::find(database, kind, id).await?.is_none() {
            return Ok(None);
        }
        let now = chrono::Utc::now();
        let (sql, values) = update_statement(kind, id, now, request);
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                values,
            ))
            .await?;
        Self::find(database, kind, id).await
    }

    pub async fn soft_delete(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
    ) -> Result<bool, AppError> {
        let sql = format!(
            "UPDATE {} SET is_active = 0, deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            kind.table()
        );
        let now = chrono::Utc::now();
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                [now.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

fn conditions(kind: MasterKind, query: &PageQuery) -> (String, Vec<sea_orm::Value>) {
    let mut parts = vec!["deleted_at IS NULL".to_owned()];
    let mut values = Vec::new();
    if let Some(active) = query.is_active {
        parts.push("is_active = ?".to_owned());
        values.push(active.into());
    }
    if let Some(search) = &query.search {
        let pattern = format!("%{}%", search.to_lowercase());
        match kind {
            MasterKind::Supplier | MasterKind::Customer => {
                parts.push("(lower(name) LIKE ? OR lower(phone) LIKE ?)".to_owned());
                values.push(pattern.clone().into());
                values.push(pattern.into());
            }
            MasterKind::Unit => {
                parts.push("(lower(name) LIKE ? OR lower(symbol) LIKE ?)".to_owned());
                values.push(pattern.clone().into());
                values.push(pattern.into());
            }
            MasterKind::Category => {
                parts.push("lower(name) LIKE ?".to_owned());
                values.push(pattern.into());
            }
        }
    }
    (parts.join(" AND "), values)
}

fn insert_statement(
    kind: MasterKind,
    id: Uuid,
    now: chrono::DateTime<chrono::Utc>,
    request: &MasterRequest,
) -> (&'static str, Vec<sea_orm::Value>) {
    match kind {
        MasterKind::Category => (
            "INSERT INTO product_categories (id, name, description, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.notes.clone().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
        ),
        MasterKind::Unit => (
            "INSERT INTO units (id, name, symbol, precision, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.symbol.clone().unwrap_or_default().trim().into(), request.precision.unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
        ),
        MasterKind::Supplier => (
            "INSERT INTO suppliers (id, name, phone, email, address, payment_terms_days, credit_limit, notes, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().unwrap_or_default().into(), request.address.clone().unwrap_or_default().into(), request.payment_terms_days.into(), request.credit_limit.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
        ),
        MasterKind::Customer => (
            "INSERT INTO customers (id, name, phone, email, address, credit_limit, is_walk_in, notes, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().into(), request.address.clone().unwrap_or_default().into(), request.credit_limit.into(), request.is_walk_in.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
        ),
    }
}

fn update_statement(
    kind: MasterKind,
    id: Uuid,
    now: chrono::DateTime<chrono::Utc>,
    request: &MasterRequest,
) -> (&'static str, Vec<sea_orm::Value>) {
    match kind {
        MasterKind::Category => (
            "UPDATE product_categories SET name = ?, description = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.notes.clone().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
        MasterKind::Unit => (
            "UPDATE units SET name = ?, symbol = ?, precision = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.symbol.clone().unwrap_or_default().trim().into(), request.precision.unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
        MasterKind::Supplier => (
            "UPDATE suppliers SET name = ?, phone = ?, email = ?, address = ?, payment_terms_days = ?, credit_limit = ?, notes = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().unwrap_or_default().into(), request.address.clone().unwrap_or_default().into(), request.payment_terms_days.into(), request.credit_limit.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
        MasterKind::Customer => (
            "UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, credit_limit = ?, is_walk_in = ?, notes = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().into(), request.address.clone().unwrap_or_default().into(), request.credit_limit.into(), request.is_walk_in.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
    }
}
