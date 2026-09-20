use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{DEFAULT_LOT_PREFIX, ERROR_LOT_NOT_FOUND, SEQUENCE_KIND_LOT},
    context::RequestContext,
    dto::{
        LotListQuery, LotResponse, Paginated, PaginationMeta, ReceiveLotRequest, UpdateLotRequest,
    },
    errors::AppError,
    repositories::{LotRepository, SequenceRepository},
    util::{money_value, parse_uuid, quantity},
};

pub struct LotService;

impl LotService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: LotListQuery,
    ) -> Result<Paginated<LotResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = LotRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(database: &DatabaseConnection, id: Uuid) -> Result<LotResponse, AppError> {
        LotRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_LOT_NOT_FOUND))
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: ReceiveLotRequest,
    ) -> Result<LotResponse, AppError> {
        request.quantity = quantity(request.quantity);
        request.cost = money_value(request.cost);
        if let Some(min) = request.min.as_mut() {
            *min = money_value(*min);
        }
        if let Some(wholesale) = request.wholesale.as_mut() {
            *wholesale = money_value(*wholesale);
        }
        if let Some(retail) = request.retail.as_mut() {
            *retail = money_value(*retail);
        }
        request.validate()?;
        let allocations = if !request.branch_allocations.is_empty() {
            request
                .branch_allocations
                .iter()
                .map(|row| {
                    Ok((
                        parse_uuid(&row.branch_id, "branchAllocation.branchId")?,
                        quantity(row.quantity),
                    ))
                })
                .collect::<Result<Vec<_>, AppError>>()?
        } else {
            let branch_id = match &request.branch_id {
                Some(value) => parse_uuid(value, "branchId")?,
                None => context.branch_id,
            };
            vec![(branch_id, request.quantity)]
        };
        let transaction = database.begin().await?;
        let lot_number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX).await?;
        let lot_id = LotRepository::receive(
            &transaction,
            &request,
            allocations,
            context.user_id,
            lot_number,
        )
        .await?;
        transaction.commit().await?;
        Self::get(database, lot_id).await
    }

    pub async fn update(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: UpdateLotRequest,
    ) -> Result<LotResponse, AppError> {
        if let Some(damaged) = request.damaged_quantity.as_mut() {
            *damaged = quantity(*damaged);
        }
        if let Some(cost) = request.cost.as_mut() {
            *cost = money_value(*cost);
        }
        if let Some(min) = request.min.as_mut() {
            *min = money_value(*min);
        }
        if let Some(wholesale) = request.wholesale.as_mut() {
            *wholesale = money_value(*wholesale);
        }
        if let Some(retail) = request.retail.as_mut() {
            *retail = money_value(*retail);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let lot_id = LotRepository::update(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, lot_id).await
    }
}
