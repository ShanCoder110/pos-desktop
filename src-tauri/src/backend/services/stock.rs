use sea_orm::DatabaseConnection;

use crate::backend::{
    context::RequestContext,
    dto::{
        Paginated, PaginationMeta, StockListQuery, StockMovementListQuery, StockMovementResponse,
        StockRow,
    },
    errors::AppError,
    repositories::StockRepository,
};

pub struct StockService;

impl StockService {
    pub async fn list(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut query: StockListQuery,
    ) -> Result<Paginated<StockRow>, AppError> {
        query.page = query.page.normalized();
        let (data, total) =
            StockRepository::list(database, &query, Some(context.branch_id)).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn list_movements(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut query: StockMovementListQuery,
    ) -> Result<Paginated<StockMovementResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) =
            StockRepository::list_movements(database, &query, Some(context.branch_id)).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }
}
