use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{DEFAULT_PRODUCTION_PREFIX, ERROR_PRODUCTION_NOT_FOUND, SEQUENCE_KIND_PRODUCTION},
    context::RequestContext,
    dto::{
        CompleteProductionRequest, CreateProductionRequest, Paginated, PaginationMeta,
        ProductionListQuery, ProductionResponse,
    },
    errors::AppError,
    repositories::{ProductionRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct ProductionService;

impl ProductionService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: ProductionListQuery,
    ) -> Result<Paginated<ProductionResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = ProductionRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<ProductionResponse, AppError> {
        ProductionRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_PRODUCTION_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateProductionRequest,
    ) -> Result<ProductionResponse, AppError> {
        request.planned_output_quantity = quantity(request.planned_output_quantity);
        for material in &mut request.materials {
            material.expected_quantity = quantity(material.expected_quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_PRODUCTION,
            DEFAULT_PRODUCTION_PREFIX,
        )
        .await?;
        let id = ProductionRepository::create(&transaction, context, &request, number).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn start(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<ProductionResponse, AppError> {
        let transaction = database.begin().await?;
        ProductionRepository::start(&transaction, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn complete(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: CompleteProductionRequest,
    ) -> Result<ProductionResponse, AppError> {
        request.actual_output_quantity = quantity(request.actual_output_quantity);
        request.labor_cost = money_value(request.labor_cost);
        request.commission_amount = money_value(request.commission_amount);
        for material in &mut request.materials {
            material.actual_quantity = quantity(material.actual_quantity);
            material.waste_base_quantity = quantity(material.waste_base_quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        ProductionRepository::complete(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }
}
