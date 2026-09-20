use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    context::RequestContext,
    dto::{CashSessionResponse, UserPermissionResponse, UserResponse},
    errors::AppError,
};

#[derive(Debug, FromQueryResult)]
pub struct UserAuthRow {
    pub id: Uuid,
    pub name: String,
    pub username: String,
    pub password_hash: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub role: String,
    pub default_branch_id: Option<Uuid>,
    pub city_id: Option<Uuid>,
    pub city_name: Option<String>,
    pub is_active: bool,
    pub last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
pub struct SessionContextRow {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub branch_id: Uuid,
    pub device_id: Uuid,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub role: String,
    pub name: String,
    pub username: String,
    pub is_active: bool,
    pub cash_session_id: Option<Uuid>,
    pub device_name: Option<String>,
}

#[derive(Debug, FromQueryResult)]
pub struct RefreshSessionRow {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub branch_id: Uuid,
    pub device_id: Uuid,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub refresh_expires_at: chrono::DateTime<chrono::Utc>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub role: String,
    pub name: String,
    pub username: String,
    pub is_active: bool,
}

#[derive(Debug, FromQueryResult)]
struct SetupStateRow {
    setup_completed: i64,
    shop_name: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct CashSessionRow {
    id: Uuid,
    branch_id: Uuid,
    device_id: Uuid,
    cashier_id: Uuid,
    status: String,
    opening_float: Decimal,
    expected_cash: Option<Decimal>,
    counted_cash: Option<Decimal>,
    variance: Option<Decimal>,
    notes: Option<String>,
    opened_at: chrono::DateTime<chrono::Utc>,
    closed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct MoneyNetRow {
    net: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct PermissionRow {
    id: Uuid,
    permission_key: String,
    is_allowed: bool,
}

pub struct AuthRepository;

impl AuthRepository {
    pub async fn find_user_by_username(
        database: &DatabaseConnection,
        username: &str,
    ) -> Result<Option<UserAuthRow>, AppError> {
        Ok(
            UserAuthRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT u.id, u.name, u.username, u.password_hash, u.phone, u.email, u.role, u.default_branch_id,
                    u.city_id, ci.name AS city_name, u.is_active, u.last_login_at, u.created_at, u.updated_at
             FROM users u
             LEFT JOIN cities ci ON ci.id = u.city_id AND ci.deleted_at IS NULL
             WHERE u.username = ? LIMIT 1",
                [username.into()],
            ))
            .one(database)
            .await?,
        )
    }

    pub async fn find_user_by_email(
        database: &DatabaseConnection,
        email: &str,
    ) -> Result<Option<UserAuthRow>, AppError> {
        Ok(
            UserAuthRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT u.id, u.name, u.username, u.password_hash, u.phone, u.email, u.role, u.default_branch_id,
                    u.city_id, ci.name AS city_name, u.is_active, u.last_login_at, u.created_at, u.updated_at
             FROM users u
             LEFT JOIN cities ci ON ci.id = u.city_id AND ci.deleted_at IS NULL
             WHERE u.email IS NOT NULL AND LOWER(u.email) = LOWER(?) LIMIT 1",
                [email.into()],
            ))
            .one(database)
            .await?,
        )
    }

    pub async fn touch_last_login(
        database: &DatabaseConnection,
        user_id: Uuid,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
                [at.into(), at.into(), user_id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn create_session(
        database: &DatabaseConnection,
        id: Uuid,
        user_id: Uuid,
        device_id: Uuid,
        branch_id: Uuid,
        token_hash: &str,
        refresh_token_hash: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
        refresh_expires_at: chrono::DateTime<chrono::Utc>,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO sessions
                    (id, user_id, device_id, branch_id, token_hash, refresh_token_hash, expires_at,
                     refresh_expires_at, revoked_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                [
                    id.into(),
                    user_id.into(),
                    device_id.into(),
                    branch_id.into(),
                    token_hash.into(),
                    refresh_token_hash.into(),
                    expires_at.into(),
                    refresh_expires_at.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn rotate_session_tokens(
        database: &DatabaseConnection,
        session_id: Uuid,
        token_hash: &str,
        refresh_token_hash: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
        refresh_expires_at: chrono::DateTime<chrono::Utc>,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, AppError> {
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE sessions
                 SET token_hash = ?, refresh_token_hash = ?, expires_at = ?, refresh_expires_at = ?,
                     updated_at = ?
                 WHERE id = ? AND revoked_at IS NULL",
                [
                    token_hash.into(),
                    refresh_token_hash.into(),
                    expires_at.into(),
                    refresh_expires_at.into(),
                    now.into(),
                    session_id.into(),
                ],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn find_session_by_refresh_hash(
        database: &DatabaseConnection,
        refresh_token_hash: &str,
    ) -> Result<Option<RefreshSessionRow>, AppError> {
        Ok(
            RefreshSessionRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT s.id AS session_id, s.user_id, s.branch_id, s.device_id, s.expires_at,
                    s.refresh_expires_at, s.revoked_at, u.role, u.name, u.username, u.is_active
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.refresh_token_hash = ?
             LIMIT 1",
                [refresh_token_hash.into()],
            ))
            .one(database)
            .await?,
        )
    }

    pub async fn setup_status(
        database: &DatabaseConnection,
    ) -> Result<(bool, Option<String>), AppError> {
        let row = SetupStateRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT ss.setup_completed,
                    (
                      SELECT rs.shop_name
                      FROM receipt_settings rs
                      JOIN branches b ON b.id = rs.branch_id
                      WHERE b.is_main = 1 AND b.deleted_at IS NULL
                      ORDER BY rs.updated_at DESC
                      LIMIT 1
                    ) AS shop_name
             FROM system_state ss
             WHERE ss.id = 1
             LIMIT 1",
            [],
        ))
        .one(database)
        .await?;
        Ok(match row {
            Some(row) => (row.setup_completed == 0, row.shop_name),
            None => (true, None),
        })
    }

    pub async fn mark_setup_complete(
        database: &DatabaseConnection,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO system_state (id, setup_completed, updated_at)
                 VALUES (1, 1, ?)
                 ON CONFLICT(id) DO UPDATE SET setup_completed = 1, updated_at = excluded.updated_at",
                [now.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn find_session_by_token_hash(
        database: &DatabaseConnection,
        token_hash: &str,
    ) -> Result<Option<SessionContextRow>, AppError> {
        Ok(
            SessionContextRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT s.id AS session_id, s.user_id, s.branch_id, s.device_id, s.expires_at, s.revoked_at,
                        u.role, u.name, u.username, u.is_active,
                        (
                          SELECT cs.id FROM cash_sessions cs
                          WHERE cs.device_id = s.device_id AND cs.status = 'OPEN'
                          LIMIT 1
                        ) AS cash_session_id,
                        d.name AS device_name
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 LEFT JOIN devices d ON d.id = s.device_id
                 WHERE s.token_hash = ?
                 LIMIT 1",
                [token_hash.into()],
            ))
            .one(database)
            .await?,
        )
    }

    pub async fn revoke_session(
        database: &DatabaseConnection,
        session_id: Uuid,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, AppError> {
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE sessions SET revoked_at = ?, updated_at = ?
                 WHERE id = ? AND revoked_at IS NULL",
                [now.into(), now.into(), session_id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn find_open_cash_session(
        database: &DatabaseConnection,
        device_id: Uuid,
    ) -> Result<Option<CashSessionResponse>, AppError> {
        Ok(
            CashSessionRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                cash_session_projection(),
                [device_id.into()],
            ))
            .one(database)
            .await?
            .map(Into::into),
        )
    }

    pub async fn find_cash_session(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<CashSessionResponse>, AppError> {
        Ok(
            CashSessionRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, branch_id, device_id, cashier_id, status, opening_float, expected_cash,
                        counted_cash, variance, notes, opened_at, closed_at, created_at, updated_at
                 FROM cash_sessions WHERE id = ? LIMIT 1",
                [id.into()],
            ))
            .one(database)
            .await?
            .map(Into::into),
        )
    }

    pub async fn create_cash_session(
        database: &DatabaseConnection,
        id: Uuid,
        branch_id: Uuid,
        device_id: Uuid,
        cashier_id: Uuid,
        opening_float: Decimal,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), AppError> {
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO cash_sessions
                    (id, branch_id, device_id, cashier_id, status, opening_float, expected_cash,
                     counted_cash, variance, notes, opened_at, closed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'OPEN', ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?)",
                [
                    id.into(),
                    branch_id.into(),
                    device_id.into(),
                    cashier_id.into(),
                    opening_float.into(),
                    now.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn close_cash_session(
        database: &DatabaseConnection,
        id: Uuid,
        expected_cash: Decimal,
        counted_cash: Decimal,
        variance: Decimal,
        notes: Option<&str>,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, AppError> {
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE cash_sessions
                 SET status = 'CLOSED', expected_cash = ?, counted_cash = ?, variance = ?,
                     notes = ?, closed_at = ?, updated_at = ?
                 WHERE id = ? AND status = 'OPEN'",
                [
                    expected_cash.into(),
                    counted_cash.into(),
                    variance.into(),
                    notes.into(),
                    now.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn cash_session_expected(
        database: &DatabaseConnection,
        session_id: Uuid,
        opening_float: Decimal,
    ) -> Result<Decimal, AppError> {
        let net = MoneyNetRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) AS REAL) AS net
             FROM money_transactions
             WHERE cash_session_id = ? AND payment_method = 'CASH'",
            [session_id.into()],
        ))
        .one(database)
        .await?
        .map(|row| row.net)
        .unwrap_or(Decimal::ZERO);
        Ok(opening_float + net)
    }

    pub async fn load_user_response(
        database: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<Option<UserResponse>, AppError> {
        let row = UserAuthRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT u.id, u.name, u.username, u.password_hash, u.phone, u.email, u.role, u.default_branch_id,
                    u.city_id, ci.name AS city_name, u.is_active, u.last_login_at, u.created_at, u.updated_at
             FROM users u
             LEFT JOIN cities ci ON ci.id = u.city_id AND ci.deleted_at IS NULL
             WHERE u.id = ? LIMIT 1",
            [user_id.into()],
        ))
        .one(database)
        .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let permissions = Self::list_permissions(database, user_id).await?;
        Ok(Some(user_response_from_auth(row, permissions)))
    }

    pub async fn list_permissions(
        database: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<Vec<UserPermissionResponse>, AppError> {
        let rows = PermissionRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, permission_key, is_allowed
             FROM user_permissions WHERE user_id = ?
             ORDER BY permission_key ASC",
            [user_id.into()],
        ))
        .all(database)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| UserPermissionResponse {
                id: row.id.to_string(),
                permission_key: row.permission_key,
                is_allowed: row.is_allowed,
            })
            .collect())
    }
}

impl SessionContextRow {
    pub fn into_context(self) -> RequestContext {
        RequestContext {
            session_id: self.session_id,
            user_id: self.user_id,
            branch_id: self.branch_id,
            device_id: self.device_id,
            cash_session_id: self.cash_session_id,
            role: self.role,
            name: self.name,
            username: self.username,
        }
    }
}

impl From<CashSessionRow> for CashSessionResponse {
    fn from(row: CashSessionRow) -> Self {
        Self {
            id: row.id.to_string(),
            branch_id: row.branch_id.to_string(),
            device_id: row.device_id.to_string(),
            cashier_id: row.cashier_id.to_string(),
            status: row.status,
            opening_float: decimal(row.opening_float),
            expected_cash: row.expected_cash.map(decimal),
            counted_cash: row.counted_cash.map(decimal),
            variance: row.variance.map(decimal),
            notes: row.notes,
            opened_at: row.opened_at.to_rfc3339(),
            closed_at: row.closed_at.map(|value| value.to_rfc3339()),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

pub fn user_response_from_auth(
    row: UserAuthRow,
    permissions: Vec<UserPermissionResponse>,
) -> UserResponse {
    UserResponse {
        id: row.id.to_string(),
        name: row.name,
        username: row.username,
        phone: row.phone,
        email: row.email,
        role: row.role,
        default_branch_id: row.default_branch_id.map(|value| value.to_string()),
        city_id: row.city_id.map(|value| value.to_string()),
        city_name: row.city_name,
        is_active: row.is_active,
        last_login_at: row.last_login_at.map(|value| value.to_rfc3339()),
        permissions,
        total_paid: 0.0,
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn cash_session_projection() -> &'static str {
    "SELECT id, branch_id, device_id, cashier_id, status, opening_float, expected_cash,
            counted_cash, variance, notes, opened_at, closed_at, created_at, updated_at
     FROM cash_sessions
     WHERE device_id = ? AND status = 'OPEN'
     LIMIT 1"
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
