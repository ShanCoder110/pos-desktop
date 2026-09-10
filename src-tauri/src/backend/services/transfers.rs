use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{DEFAULT_TRANSFER_PREFIX, ERROR_TRANSFER_NOT_FOUND, SEQUENCE_KIND_TRANSFER},
    context::RequestContext,
    dto::{
        CreateTransferRequest, Paginated, PaginationMeta, TransferListQuery, TransferResponse,
    },
    errors::AppError,
    repositories::{SequenceRepository, TransferRepository},
    util::quantity,
};

pub struct TransferService;

impl TransferService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: TransferListQuery,
    ) -> Result<Paginated<TransferResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = TransferRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        TransferRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateTransferRequest,
    ) -> Result<TransferResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_TRANSFER,
            DEFAULT_TRANSFER_PREFIX,
        )
        .await?;
        let id = TransferRepository::create(&transaction, context, &request, number).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn send(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        let transaction = database.begin().await?;
        TransferRepository::send(&transaction, context, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        let transaction = database.begin().await?;
        TransferRepository::receive(&transaction, context, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }
}
