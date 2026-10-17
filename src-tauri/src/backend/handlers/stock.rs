use axum::{
    extract::{Query, State},
    Json,
};

use crate::backend::{
    context::RequestContext,
    dto::{
        Paginated, StockCountRequest, StockCountResponse, StockListQuery, StockMovementListQuery,
        StockMovementResponse, StockReconcileResponse, StockRow,
    },
    errors::AppError,
    services::StockService,
    AppState,
};

pub async fn list_stock(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<StockListQuery>,
) -> Result<Json<Paginated<StockRow>>, AppError> {
    Ok(Json(StockService::list(&state.db, &ctx, query).await?))
}

pub async fn list_stock_movements(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<StockMovementListQuery>,
) -> Result<Json<Paginated<StockMovementResponse>>, AppError> {
    Ok(Json(
        StockService::list_movements(&state.db, &ctx, query).await?,
    ))
}

pub async fn count_stock(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<StockCountRequest>,
) -> Result<Json<StockCountResponse>, AppError> {
    Ok(Json(StockService::count(&state.db, &ctx, request).await?))
}

pub async fn reconcile_stock(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<StockReconcileResponse>, AppError> {
    Ok(Json(StockService::reconcile(&state.db, &ctx).await?))
}
