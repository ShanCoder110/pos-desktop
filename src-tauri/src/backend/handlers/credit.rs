use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sea_orm::{DatabaseBackend, FromQueryResult, Statement};
use serde::Serialize;
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        ClaimListQuery, ClaimResponse, CreateClaimRequest, CreateReturnRequest,
        CustomerLedgerEntryResponse, CustomerLedgerListQuery, CustomerLedgerResponse,
        CustomerPaymentRequest, CustomerPaymentResponse, Paginated, ReturnListQuery,
        ReturnResponse,
    },
    errors::AppError,
    services::CreditService,
    AppState,
};

#[derive(Debug, FromQueryResult, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditBookSummary {
    owed_to_shop: f64,
    owing_accounts: i64,
    profit_on_hold: f64,
    advance_held: f64,
    settled: i64,
}

pub async fn credit_book_summary(
    State(state): State<AppState>,
    _ctx: RequestContext,
) -> Result<Json<CreditBookSummary>, AppError> {
    let summary = CreditBookSummary::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        "WITH enrolled AS (SELECT c.id, COALESCE((SELECT cle.balance_after FROM customer_ledger_entries cle WHERE cle.customer_id = c.id ORDER BY cle.occurred_at DESC, cle.created_at DESC, cle.rowid DESC LIMIT 1), 0) AS balance, COALESCE((SELECT SUM(ii.gross_profit * CASE WHEN i.total > 0 THEN i.credit_amount / i.total ELSE 0 END) FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id WHERE i.customer_id = c.id AND i.credit_amount > 0 AND i.status = 'COMPLETED' AND i.deleted_at IS NULL), 0) AS profit FROM customers c WHERE c.in_credit_book = 1 AND c.is_active = 1 AND c.is_walk_in = 0 AND c.deleted_at IS NULL) SELECT CAST(COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS REAL) AS owed_to_shop, CAST(COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0) AS INTEGER) AS owing_accounts, CAST(COALESCE(SUM(profit), 0) AS REAL) AS profit_on_hold, CAST(COALESCE(SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0) AS REAL) AS advance_held, CAST(COALESCE(SUM(CASE WHEN balance = 0 THEN 1 ELSE 0 END), 0) AS INTEGER) AS settled FROM enrolled".to_owned(),
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| AppError::Internal("Credit summary unavailable".into()))?;
    Ok(Json(summary))
}

pub async fn get_customer_ledger(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<CustomerLedgerResponse>, AppError> {
    Ok(Json(
        CreditService::customer_ledger(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn list_customer_ledgers(
    State(state): State<AppState>,
    Query(query): Query<CustomerLedgerListQuery>,
) -> Result<Json<Paginated<CustomerLedgerEntryResponse>>, AppError> {
    Ok(Json(
        CreditService::list_customer_ledgers(&state.db, query).await?,
    ))
}

pub async fn create_customer_payment(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<CustomerPaymentRequest>,
) -> Result<(StatusCode, Json<CustomerPaymentResponse>), AppError> {
    let payment = CreditService::customer_payment(&state.db, &ctx, parse_id(&id)?, request).await?;
    Ok((StatusCode::CREATED, Json(payment)))
}

pub async fn list_returns(
    State(state): State<AppState>,
    Query(query): Query<ReturnListQuery>,
) -> Result<Json<Paginated<ReturnResponse>>, AppError> {
    Ok(Json(CreditService::list_returns(&state.db, query).await?))
}

pub async fn get_return(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReturnResponse>, AppError> {
    Ok(Json(
        CreditService::get_return(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_return(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateReturnRequest>,
) -> Result<(StatusCode, Json<ReturnResponse>), AppError> {
    let ret = CreditService::create_return(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(ret)))
}

pub async fn list_claims(
    State(state): State<AppState>,
    Query(query): Query<ClaimListQuery>,
) -> Result<Json<Paginated<ClaimResponse>>, AppError> {
    Ok(Json(CreditService::list_claims(&state.db, query).await?))
}

pub async fn get_claim(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ClaimResponse>, AppError> {
    Ok(Json(
        CreditService::get_claim(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_claim(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateClaimRequest>,
) -> Result<(StatusCode, Json<ClaimResponse>), AppError> {
    let claim = CreditService::create_claim(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(claim)))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
