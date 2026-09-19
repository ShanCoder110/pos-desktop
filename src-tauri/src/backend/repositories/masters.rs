use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement, TransactionTrait,
};
use uuid::Uuid;

use crate::backend::{
    context::RequestContext,
    dto::{MasterRequest, MasterResponse, PageQuery},
    errors::AppError,
    repositories::{LedgerParty, LedgerRepository},
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
            Self::Category => "id, name, NULL AS symbol, NULL AS phone, NULL AS email, NULL AS address, description AS notes, is_active, NULL AS precision, NULL AS balance, NULL AS is_walk_in, created_at, updated_at",
            Self::Unit => "id, name, symbol, NULL AS phone, NULL AS email, NULL AS address, NULL AS notes, is_active, precision, NULL AS balance, NULL AS is_walk_in, created_at, updated_at",
            Self::Supplier => "id, name, NULL AS symbol, phone, email, address, notes, is_active, NULL AS precision, CAST((SELECT sle.balance_after FROM supplier_ledger_entries sle WHERE sle.supplier_id = suppliers.id ORDER BY sle.occurred_at DESC, sle.created_at DESC LIMIT 1) AS REAL) AS balance, NULL AS is_walk_in, created_at, updated_at",
            Self::Customer => "id, name, NULL AS symbol, phone, email, address, notes, is_active, NULL AS precision, CAST((SELECT cle.balance_after FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id ORDER BY cle.occurred_at DESC, cle.created_at DESC LIMIT 1) AS REAL) AS balance, is_walk_in, created_at, updated_at",
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
    balance: Option<rust_decimal::Decimal>,
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
            balance: row.balance.and_then(|value| value.to_f64()),
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
            Some("name") => "name",
            Some("updatedAt") => "updated_at",
            _ => "created_at",
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
        context: Option<&RequestContext>,
    ) -> Result<MasterResponse, AppError> {
        ensure_unique_party_phone(database, kind, request.phone.as_deref().unwrap_or(""), None)
            .await?;
        let id = Uuid::new_v4();
        let now = chrono::Utc::now();
        let (sql, values) = insert_statement(kind, id, now, request);
        let txn = database.begin().await?;
        txn.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .await?;
        if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
            if matches!(kind, MasterKind::Customer) && request.is_walk_in {
                // Walk-in customers never hold a balance.
            } else {
                let party = match kind {
                    MasterKind::Supplier => LedgerParty::Supplier(id),
                    MasterKind::Customer => LedgerParty::Customer(id),
                    _ => unreachable!(),
                };
                if request.previous_balance.unwrap_or(0.0) != 0.0 {
                    let Some(context) = context else {
                        return Err(AppError::internal(
                            "Opening balance needs a signed-in branch.",
                        ));
                    };
                    let amount =
                        rust_decimal::Decimal::from_f64(request.previous_balance.unwrap_or(0.0))
                            .unwrap_or_default();
                    LedgerRepository::post_opening(
                        &txn,
                        party,
                        context.branch_id,
                        amount,
                        now,
                        context.user_id,
                    )
                    .await?;
                }
            }
        }
        txn.commit().await?;
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
        ensure_unique_party_phone(
            database,
            kind,
            request.phone.as_deref().unwrap_or(""),
            Some(id),
        )
        .await?;
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
        deleted_by: Option<Uuid>,
    ) -> Result<bool, AppError> {
        let sql = format!(
            "UPDATE {} SET is_active = 0, deleted_at = ?, deleted_by = ?, version = version + 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            kind.table()
        );
        let now = chrono::Utc::now();
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                [now.into(), deleted_by.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

async fn ensure_unique_party_phone(
    database: &DatabaseConnection,
    kind: MasterKind,
    phone: &str,
    exclude_id: Option<Uuid>,
) -> Result<(), AppError> {
    let phone = phone.trim();
    if phone.is_empty() {
        return Ok(());
    }
    let (table, message) = match kind {
        MasterKind::Supplier => (
            "suppliers",
            crate::backend::constants::ERROR_DUPLICATE_SUPPLIER_PHONE,
        ),
        MasterKind::Customer => (
            "customers",
            crate::backend::constants::ERROR_DUPLICATE_CUSTOMER_PHONE,
        ),
        _ => return Ok(()),
    };
    let sql = if exclude_id.is_some() {
        format!("SELECT COUNT(*) AS count FROM {table} WHERE phone = ? AND deleted_at IS NULL AND id != ?")
    } else {
        format!("SELECT COUNT(*) AS count FROM {table} WHERE phone = ? AND deleted_at IS NULL")
    };
    let values = if let Some(exclude_id) = exclude_id {
        vec![phone.into(), exclude_id.into()]
    } else {
        vec![phone.into()]
    };
    let exists = CountRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        &sql,
        values,
    ))
    .one(database)
    .await?
    .map(|row| row.count > 0)
    .unwrap_or(false);
    if exists {
        return Err(AppError::Conflict(message.into()));
    }
    Ok(())
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
                parts.push(
                    "(lower(name) LIKE ? OR lower(phone) LIKE ? OR lower(address) LIKE ?)"
                        .to_owned(),
                );
                values.push(pattern.clone().into());
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
    if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
        push_like(&mut parts, &mut values, "name", query.name.as_deref());
        push_like(&mut parts, &mut values, "phone", query.phone.as_deref());
        push_like(&mut parts, &mut values, "email", query.email.as_deref());
        push_like(&mut parts, &mut values, "address", query.address.as_deref());
        push_like(&mut parts, &mut values, "notes", query.notes.as_deref());
        if let Some(balance) = query.balance.as_deref() {
            let expr = match kind {
                MasterKind::Supplier => SUPPLIER_BALANCE_SQL,
                MasterKind::Customer => CUSTOMER_BALANCE_SQL,
                _ => "",
            };
            match balance.to_ascii_lowercase().as_str() {
                "payable" | "owes" => parts.push(format!("({expr}) > 0")),
                "advance" => parts.push(format!("({expr}) < 0")),
                "settled" => parts.push(format!("({expr}) = 0")),
                _ => {}
            }
        }
    }
    (parts.join(" AND "), values)
}

const SUPPLIER_BALANCE_SQL: &str = "COALESCE((SELECT sle.balance_after FROM supplier_ledger_entries sle WHERE sle.supplier_id = suppliers.id ORDER BY sle.occurred_at DESC, sle.created_at DESC LIMIT 1), 0)";
const CUSTOMER_BALANCE_SQL: &str = "COALESCE((SELECT cle.balance_after FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id ORDER BY cle.occurred_at DESC, cle.created_at DESC LIMIT 1), 0)";

fn push_like(
    parts: &mut Vec<String>,
    values: &mut Vec<sea_orm::Value>,
    column: &str,
    value: Option<&str>,
) {
    if let Some(value) = value {
        parts.push(format!("lower({column}) LIKE ?"));
        values.push(format!("%{}%", value.to_lowercase()).into());
    }
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
            "INSERT INTO suppliers (id, name, phone, email, address, notes, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().unwrap_or_default().into(), request.address.clone().unwrap_or_default().into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
        ),
        MasterKind::Customer => (
            "INSERT INTO customers (id, name, phone, email, address, is_walk_in, notes, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            vec![id.into(), request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().into(), request.address.clone().unwrap_or_default().into(), request.is_walk_in.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), now.to_rfc3339().into()],
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
            "UPDATE suppliers SET name = ?, phone = ?, email = ?, address = ?, notes = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().unwrap_or_default().into(), request.address.clone().unwrap_or_default().into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
        MasterKind::Customer => (
            "UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, is_walk_in = ?, notes = ?, is_active = ?, version = version + 1, updated_at = ? WHERE id = ?",
            vec![request.name.trim().into(), request.phone.clone().unwrap_or_default().into(), request.email.clone().into(), request.address.clone().unwrap_or_default().into(), request.is_walk_in.into(), request.notes.clone().unwrap_or_default().into(), request.is_active.into(), now.to_rfc3339().into(), id.into()],
        ),
    }
}
