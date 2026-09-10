use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_PO_PREFIX, DEFAULT_RECEIPT_PREFIX, ERROR_PO_NOT_FOUND, SEQUENCE_KIND_PURCHASE_ORDER,
        SEQUENCE_KIND_RECEIPT,
    },
    context::RequestContext,
    dto::{
        CreatePurchaseOrderRequest, Paginated, PaginationMeta, PurchaseOrderListQuery,
        PurchaseOrderResponse, ReceivePurchaseOrderRequest, SupplierLedgerEntryResponse,
        SupplierPaymentRequest, SupplierPaymentResponse,
    },
    errors::AppError,
    repositories::{PurchasingRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct PurchasingService;

impl PurchasingService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: PurchaseOrderListQuery,
    ) -> Result<Paginated<PurchaseOrderResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = PurchasingRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<PurchaseOrderResponse, AppError> {
        PurchasingRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_PO_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreatePurchaseOrderRequest,
    ) -> Result<PurchaseOrderResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
            item.unit_cost = money_value(item.unit_cost);
        }
        request.discount = money_value(request.discount);
        request.tax = money_value(request.tax);
        request.validate()?;
        let transaction = database.begin().await?;
        let order_number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_PURCHASE_ORDER,
            DEFAULT_PO_PREFIX,
        )
        .await?;
        let id =
            PurchasingRepository::create_draft(&transaction, context, &request, order_number)
                .await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn order(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<PurchaseOrderResponse, AppError> {
        let transaction = database.begin().await?;
        PurchasingRepository::mark_ordered(&transaction, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: ReceivePurchaseOrderRequest,
    ) -> Result<PurchaseOrderResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let receipt_number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_RECEIPT, DEFAULT_RECEIPT_PREFIX)
                .await?;
        PurchasingRepository::receive(&transaction, context, id, &request, receipt_number)
            .await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn supplier_ledger(
        database: &DatabaseConnection,
        supplier_id: Uuid,
    ) -> Result<Vec<SupplierLedgerEntryResponse>, AppError> {
        PurchasingRepository::supplier_ledger(database, supplier_id).await
    }

    pub async fn supplier_payment(
        database: &DatabaseConnection,
        context: &RequestContext,
        supplier_id: Uuid,
        mut request: SupplierPaymentRequest,
    ) -> Result<SupplierPaymentResponse, AppError> {
        request.amount = money_value(request.amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let response =
            PurchasingRepository::supplier_payment(&transaction, context, supplier_id, &request)
                .await?;
        transaction.commit().await?;
        Ok(response)
    }
}
