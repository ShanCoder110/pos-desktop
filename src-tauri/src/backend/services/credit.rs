use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{ERROR_CLAIM_NOT_FOUND, ERROR_RETURN_NOT_FOUND},
    context::RequestContext,
    dto::{
        ClaimListQuery, ClaimResponse, CreateClaimRequest, CreateReturnRequest,
        CustomerLedgerEntryResponse, CustomerLedgerListQuery, CustomerLedgerResponse,
        CustomerPaymentRequest, CustomerPaymentResponse, Paginated, PaginationMeta,
        ReturnListQuery, ReturnResponse,
    },
    errors::AppError,
    repositories::{CreditRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct CreditService;

impl CreditService {
    pub async fn customer_ledger(
        database: &DatabaseConnection,
        customer_id: Uuid,
    ) -> Result<CustomerLedgerResponse, AppError> {
        CreditRepository::customer_ledger(database, customer_id).await
    }

    pub async fn list_customer_ledgers(
        database: &DatabaseConnection,
        mut query: CustomerLedgerListQuery,
    ) -> Result<Paginated<CustomerLedgerEntryResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = CreditRepository::list_customer_ledgers(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn customer_payment(
        database: &DatabaseConnection,
        context: &RequestContext,
        customer_id: Uuid,
        mut request: CustomerPaymentRequest,
    ) -> Result<CustomerPaymentResponse, AppError> {
        request.amount = money_value(request.amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let response =
            CreditRepository::customer_payment(&transaction, context, customer_id, &request)
                .await?;
        transaction.commit().await?;
        Ok(response)
    }

    pub async fn list_returns(
        database: &DatabaseConnection,
        mut query: ReturnListQuery,
    ) -> Result<Paginated<ReturnResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = CreditRepository::list_returns(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get_return(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<ReturnResponse, AppError> {
        CreditRepository::find_return(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_RETURN_NOT_FOUND))
    }

    pub async fn create_return(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateReturnRequest,
    ) -> Result<ReturnResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
            item.refund_amount = money_value(item.refund_amount);
        }
        for item in &mut request.replacements {
            item.quantity = quantity(item.quantity);
            item.unit_price = money_value(item.unit_price);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let return_number = SequenceRepository::next(&transaction, "sale_return", "SR").await?;
        let id =
            CreditRepository::create_return(&transaction, context, &request, return_number).await?;
        transaction.commit().await?;
        Self::get_return(database, id).await
    }

    pub async fn list_claims(
        database: &DatabaseConnection,
        mut query: ClaimListQuery,
    ) -> Result<Paginated<ClaimResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = CreditRepository::list_claims(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get_claim(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<ClaimResponse, AppError> {
        CreditRepository::find_claim(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_CLAIM_NOT_FOUND))
    }

    pub async fn create_claim(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateClaimRequest,
    ) -> Result<ClaimResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
            item.cost = money_value(item.cost);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let claim_number = SequenceRepository::next(&transaction, "warranty_claim", "CLM").await?;
        let id =
            CreditRepository::create_claim(&transaction, context, &request, claim_number).await?;
        transaction.commit().await?;
        Self::get_claim(database, id).await
    }
}
