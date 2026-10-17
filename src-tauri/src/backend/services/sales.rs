use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_INVOICE_PREFIX, ERROR_HOLD_NOT_FOUND, ERROR_INVOICE_NOT_FOUND,
        SEQUENCE_KIND_INVOICE,
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
        let invoice_number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_INVOICE, DEFAULT_INVOICE_PREFIX)
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

    pub async fn get(database: &DatabaseConnection, id: Uuid) -> Result<InvoiceResponse, AppError> {
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

    pub async fn revise(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
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
        let transaction = database.begin().await?;
        SalesRepository::revise(&transaction, context, id, &request).await?;
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

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{
            CashSessionOpenRequest, CompleteSaleRequest, CreateProductRequest, CreateReturnRequest,
            CustomerPaymentRequest, MasterRequest, OpeningStockInput, ProductUnitInput,
            ReturnItemInput, SaleItemInput,
        },
        repositories::{
            CreditRepository, LedgerParty, LedgerRepository, MasterKind, OrgRepository,
        },
        services::{AuthService, CreditService, MasterService, ProductService, SalesService},
    };

    async fn seed_owner(database: &DatabaseConnection) {
        OrgRepository::create_user(
            database,
            Uuid::parse_str(SEED_USER_ID).unwrap(),
            "Owner",
            "owner",
            "test-password-hash",
            None,
            None,
            "OWNER",
            Some(Uuid::parse_str(SEED_BRANCH_ID).unwrap()),
            None,
            true,
            chrono::Utc::now(),
        )
        .await
        .expect("seed owner");
    }

    fn ctx() -> RequestContext {
        RequestContext {
            session_id: Uuid::new_v4(),
            user_id: Uuid::parse_str(SEED_USER_ID).unwrap(),
            branch_id: Uuid::parse_str(SEED_BRANCH_ID).unwrap(),
            device_id: Uuid::parse_str(SEED_DEVICE_ID).unwrap(),
            cash_session_id: None,
            role: "OWNER".into(),
            name: "Owner".into(),
            username: "owner".into(),
        }
    }

    async fn ledger_balances(database: &DatabaseConnection, customer_id: &str) -> Vec<f64> {
        #[derive(Debug, FromQueryResult)]
        struct Row {
            balance_after: f64,
        }
        let cid = Uuid::parse_str(customer_id).unwrap();
        Row::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at ASC, created_at ASC, rowid ASC",
            [cid.into()],
        ))
        .all(database)
        .await
        .expect("ledger rows")
        .into_iter()
        .map(|r| r.balance_after)
        .collect()
    }

    #[tokio::test]
    async fn credit_revise_then_new_sale_chains_balance_after() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "LedgerQA".into(),
                symbol: None,
                phone: None,
                email: None,
                address: None,
                city_id: None,
                notes: None,
                is_active: true,
                precision: None,
                is_walk_in: false,
                in_credit_book: None,
                previous_balance: None,
            },
            None,
        )
        .await
        .expect("category");
        let customer = MasterService::create(
            &database,
            MasterKind::Customer,
            MasterRequest {
                name: "Ledger Customer".into(),
                symbol: None,
                phone: Some("03001112233".into()),
                email: None,
                address: None,
                city_id: None,
                notes: None,
                is_active: true,
                precision: None,
                is_walk_in: false,
                in_credit_book: Some(true),
                previous_balance: None,
            },
            Some(&context),
        )
        .await
        .expect("customer");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("units")
            .data
            .into_iter()
            .find(|u| u.symbol.as_deref() == Some("pc"))
            .expect("pc");

        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Ledger Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: unit.id.clone(),
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(8, 0),
                    min: Decimal::new(10, 0),
                    wholesale: Decimal::new(12, 0),
                    price: Decimal::new(15, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(200, 0),
                    cost: Decimal::new(8, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let unit_id = product.sell_units[0].id.clone();

        // Credit sale 2 × 15 = 30 → balance_after 30
        let first = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ledger-sale-1".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(15, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("first credit sale");
        assert_eq!(first.credit_amount, 30.0);
        assert_eq!(ledger_balances(&database, &customer.id).await, vec![30.0]);

        // Revise 2 → 1 (credit 15). Net: reverse 30, post 15 → balance_after 15
        let revised = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&first.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "ledger-revise-1".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::ONE,
                    unit_price: Decimal::new(15, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("revise to 15");
        assert_eq!(revised.credit_amount, 15.0);
        let after_revise = ledger_balances(&database, &customer.id).await;
        assert_eq!(*after_revise.last().unwrap(), 15.0);

        // New credit sale 30 → must be 15 + 30 = 45 (QA bug was storing 30)
        let second = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ledger-sale-2".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(15, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("second credit sale");
        assert_eq!(second.credit_amount, 30.0);
        let after_second = ledger_balances(&database, &customer.id).await;
        assert_eq!(*after_second.last().unwrap(), 45.0);

        // Payment / return need an open till.
        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::ZERO,
            },
        )
        .await
        .expect("open cash session");
        let mut context = context;
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        // Payment 20 → 25
        let pay = CreditService::customer_payment(
            &database,
            &context,
            Uuid::parse_str(&customer.id).unwrap(),
            CustomerPaymentRequest {
                amount: Decimal::new(20, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: None,
                client_request_id: Some("ledger-pay-1".into()),
            },
        )
        .await
        .expect("payment");
        assert_eq!(pay.balance_after, 25.0);
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            25.0
        );

        // Return 10 against second invoice → 15
        let item_id = second.items[0].id.clone();
        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: second.id.clone(),
                return_type: "REFUND".into(),
                reason: "QA return".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: item_id,
                    quantity: Decimal::ONE,
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(10, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("return");
        let after_return = ledger_balances(&database, &customer.id).await;
        assert_eq!(*after_return.last().unwrap(), 15.0);

        // Deliberately break the latest row, then recompute repairs it.
        let cid = Uuid::parse_str(&customer.id).unwrap();
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE customer_ledger_entries SET balance_after = 999 WHERE id = (
                    SELECT id FROM customer_ledger_entries WHERE customer_id = ?
                    ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1
                )",
                [cid.into()],
            ))
            .await
            .expect("break balance");
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            999.0
        );
        LedgerRepository::recompute_balances(&database)
            .await
            .expect("recompute");
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            15.0
        );
        assert_eq!(
            LedgerRepository::current_balance(&database, LedgerParty::Customer(cid))
                .await
                .unwrap(),
            Decimal::new(15, 0)
        );

        let _ = CreditRepository::customer_ledger(&database, cid).await;
    }
}
