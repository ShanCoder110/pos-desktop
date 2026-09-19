use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        CreateProductRequest, DeleteResponse, Paginated, ProductListQuery, ProductResponse,
        ProductSearchResponse, UpdateProductRequest,
    },
    errors::AppError,
    services::ProductService,
    AppState,
};

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn list_products(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(mut query): Query<ProductListQuery>,
) -> Result<Json<Paginated<ProductResponse>>, AppError> {
    if query.branch_id.is_none() {
        query.branch_id = Some(ctx.branch_id.to_string());
    }
    Ok(Json(ProductService::list(&state.db, query).await?))
}

pub async fn search_products(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ProductSearchResponse>, AppError> {
    let products = ProductService::search(&state.db, &query.q, Some(ctx.branch_id)).await?;
    Ok(Json(ProductSearchResponse { products }))
}

pub async fn get_product(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<ProductResponse>, AppError> {
    Ok(Json(
        ProductService::get(&state.db, product_id(&id)?, Some(ctx.branch_id)).await?,
    ))
}

pub async fn create_product(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateProductRequest>,
) -> Result<(StatusCode, Json<ProductResponse>), AppError> {
    let product = ProductService::create(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(product)))
}

pub async fn update_product(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<UpdateProductRequest>,
) -> Result<Json<ProductResponse>, AppError> {
    Ok(Json(
        ProductService::update(&state.db, &ctx, product_id(&id)?, request).await?,
    ))
}

pub async fn delete_product(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<DeleteResponse>, AppError> {
    let _ = ctx;
    Ok(Json(
        ProductService::delete(&state.db, product_id(&id)?).await?,
    ))
}

fn product_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
