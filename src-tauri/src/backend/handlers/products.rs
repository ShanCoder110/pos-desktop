use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sea_orm::{DatabaseBackend, DatabaseConnection, FromQueryResult, Statement};
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        CreateProductRequest, DeleteResponse, LotListQuery, LotResponse, MasterResponse, PageQuery,
        Paginated, ProductImportCatalog, ProductImportResult, ProductListQuery, ProductResponse,
        ProductSearchResponse, UpdateProductRequest,
    },
    errors::AppError,
    repositories::MasterKind,
    services::{LotService, MasterService, ProductService},
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

/// One catalog snapshot for local screens that need the whole product list.
/// Ordinary /products remains capped and paginated for table queries.
pub async fn list_products_bulk(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(mut query): Query<ProductListQuery>,
) -> Result<Json<Paginated<ProductResponse>>, AppError> {
    query.branch_id = Some(ctx.branch_id.to_string());
    Ok(Json(ProductService::list_bulk(&state.db, query).await?))
}

pub async fn product_catalog(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(mut query): Query<ProductListQuery>,
) -> Result<Json<ProductCatalogResponse>, AppError> {
    query.branch_id = Some(ctx.branch_id.to_string());
    query.page.sort_by = Some("createdAt".to_owned());
    query.page.sort_direction = Some(crate::backend::dto::SortDirection::Desc);
    let lot_query = LotListQuery::default();
    let (products, lots, sales_summary, categories, suppliers) = tokio::try_join!(
        ProductService::list_bulk(&state.db, query),
        LotService::list_bulk(&state.db, lot_query),
        load_product_sales_summary(&state.db),
        MasterService::list(
            &state.db,
            MasterKind::Category,
            PageQuery {
                page: 1,
                per_page: 100,
                is_active: Some(true),
                ..Default::default()
            }
        ),
        MasterService::list(
            &state.db,
            MasterKind::Supplier,
            PageQuery {
                page: 1,
                per_page: 100,
                ..Default::default()
            }
        )
    )?;
    Ok(Json(ProductCatalogResponse {
        products,
        lots,
        sales_summary,
        categories: categories.data,
        suppliers: suppliers.data,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCatalogResponse {
    products: Paginated<ProductResponse>,
    lots: Paginated<LotResponse>,
    sales_summary: Vec<ProductSalesSummary>,
    categories: Vec<MasterResponse>,
    suppliers: Vec<MasterResponse>,
}

#[derive(Debug, FromQueryResult)]
struct ProductSalesAggregate {
    product_id: Uuid,
    quantity: f64,
    sales: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSalesSummary {
    product_id: String,
    quantity: f64,
    sales: f64,
}

pub async fn product_sales_summary(
    State(state): State<AppState>,
    _ctx: RequestContext,
) -> Result<Json<Vec<ProductSalesSummary>>, AppError> {
    Ok(Json(load_product_sales_summary(&state.db).await?))
}

async fn load_product_sales_summary(
    db: &DatabaseConnection,
) -> Result<Vec<ProductSalesSummary>, AppError> {
    let rows = ProductSalesAggregate::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        "SELECT product_id, CAST(SUM(base_quantity) AS REAL) AS quantity, CAST(SUM(line_total) AS REAL) AS sales FROM (SELECT ii.product_id, ii.base_quantity, ii.line_total FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.status = 'COMPLETED' AND i.deleted_at IS NULL UNION ALL SELECT rp.product_id, rp.base_quantity, rp.line_total FROM repair_parts rp JOIN repair_jobs rj ON rj.id = rp.repair_job_id) GROUP BY product_id".to_owned(),
    ))
    .all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| ProductSalesSummary {
            product_id: row.product_id.to_string(),
            quantity: row.quantity,
            sales: row.sales,
        })
        .collect())
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

pub async fn import_products(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(catalog): Json<ProductImportCatalog>,
) -> Result<Json<ProductImportResult>, AppError> {
    Ok(Json(
        ProductService::import_catalog(&state.db, &ctx, catalog).await?,
    ))
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
