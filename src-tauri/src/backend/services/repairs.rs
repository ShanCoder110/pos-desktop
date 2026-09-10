use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{DEFAULT_REPAIR_PREFIX, ERROR_REPAIR_NOT_FOUND, SEQUENCE_KIND_REPAIR},
    context::RequestContext,
    dto::{
        CompleteRepairRequest, CreateRepairRequest, DeliverRepairRequest, Paginated,
        PaginationMeta, RepairListQuery, RepairResponse,
    },
    errors::AppError,
    repositories::{RepairRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct RepairService;

impl RepairService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: RepairListQuery,
    ) -> Result<Paginated<RepairResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = RepairRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(database: &DatabaseConnection, id: Uuid) -> Result<RepairResponse, AppError> {
        RepairRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_REPAIR_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateRepairRequest,
    ) -> Result<RepairResponse, AppError> {
        request.estimated_amount = money_value(request.estimated_amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_REPAIR, DEFAULT_REPAIR_PREFIX)
                .await?;
        let id = RepairRepository::create(&transaction, context, &request, number).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn start(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<RepairResponse, AppError> {
        let transaction = database.begin().await?;
        RepairRepository::start(&transaction, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn complete(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: CompleteRepairRequest,
    ) -> Result<RepairResponse, AppError> {
        request.service_amount = money_value(request.service_amount);
        request.discount = money_value(request.discount);
        request.commission_amount = money_value(request.commission_amount);
        for part in &mut request.parts {
            part.quantity = quantity(part.quantity);
            part.selling_price = money_value(part.selling_price);
            part.waste_base_quantity = quantity(part.waste_base_quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        RepairRepository::complete(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn deliver(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: DeliverRepairRequest,
    ) -> Result<RepairResponse, AppError> {
        request.paid_amount = money_value(request.paid_amount);
        request.validate()?;
        let transaction = database.begin().await?;
        RepairRepository::deliver(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }
}
