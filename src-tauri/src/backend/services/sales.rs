use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_INVOICE_PREFIX, ERROR_HOLD_NOT_FOUND, ERROR_INVOICE_NOT_FOUND, SEQUENCE_KIND_INVOICE,
    },
    context::RequestContext,
    dto::{
        CompleteSaleRequest, DeleteResponse, HoldRequest, HoldResponse, InvoiceListQuery,
        InvoiceResponse, PageQuery, Paginated, PaginationMeta, VoidRequest,
    },
    errors::AppError,
    repositories::{SalesRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct SalesService;

impl SalesService {
    pub async fn complete(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CompleteSaleRequest,
    ) -> Result<InvoiceResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
            item.unit_price = money_value(item.unit_price);
            item.discount = money_value(item.discount);
            item.tax = money_value(item.tax);
        }
        for payment in &mut request.payments {
            payment.amount = money_value(payment.amount);
            if let Some(tendered) = payment.amount_tendered.as_mut() {
                *tendered = money_value(*tendered);
            }
        }
        request.discount = money_value(request.discount);
        request.tax = money_value(request.tax);
        request.validate()?;

        if let Some(existing) =
            SalesRepository::find_by_client_request_id(database, &request.client_request_id).await?
        {
            return Self::get(database, existing).await;
        }

        let transaction = database.begin().await?;
        let invoice_number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_INVOICE,
            DEFAULT_INVOICE_PREFIX,
        )
        .await?;
        let invoice_id =
            SalesRepository::complete(&transaction, context, &request, invoice_number).await?;
        transaction.commit().await?;
        Self::get(database, invoice_id).await
    }

    pub async fn list(
        database: &DatabaseConnection,
        mut query: InvoiceListQuery,
    ) -> Result<Paginated<InvoiceResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = SalesRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<InvoiceResponse, AppError> {
        SalesRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_INVOICE_NOT_FOUND))
    }

    pub async fn void(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        request: VoidRequest,
    ) -> Result<InvoiceResponse, AppError> {
        request.validate()?;
        let transaction = database.begin().await?;
        SalesRepository::void(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn list_holds(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut query: PageQuery,
    ) -> Result<Paginated<HoldResponse>, AppError> {
        query = query.normalized();
        let (data, total) =
            SalesRepository::list_holds(database, context.branch_id, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page, query.per_page),
        })
    }

    pub async fn get_hold(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<HoldResponse, AppError> {
        SalesRepository::find_hold(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_HOLD_NOT_FOUND))
    }

    pub async fn create_hold(
        database: &DatabaseConnection,
        context: &RequestContext,
        request: HoldRequest,
    ) -> Result<HoldResponse, AppError> {
        request.validate()?;
        SalesRepository::create_hold(database, context, &request).await
    }

    pub async fn update_hold(
        database: &DatabaseConnection,
        id: Uuid,
        request: HoldRequest,
    ) -> Result<HoldResponse, AppError> {
        request.validate()?;
        SalesRepository::update_hold(database, id, &request)
            .await?
            .ok_or(AppError::NotFound(ERROR_HOLD_NOT_FOUND))
    }

    pub async fn delete_hold(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<DeleteResponse, AppError> {
        if !SalesRepository::delete_hold(database, id).await? {
            return Err(AppError::NotFound(ERROR_HOLD_NOT_FOUND));
        }
        Ok(DeleteResponse {
            id: id.to_string(),
            deleted: true,
        })
    }
}
