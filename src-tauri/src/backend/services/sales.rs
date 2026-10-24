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
            ReturnItemInput, SaleItemInput, SalePaymentInput,
        },
        repositories::{
            CreditRepository, LedgerParty, LedgerRepository, MasterKind, MasterRepository,
            OrgRepository,
        },
        services::{
            AuthService, CreditService, FinanceService, MasterService, ProductService, SalesService,
        },
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

    async fn count_rows(database: &DatabaseConnection, sql: &str, id: &str) -> i64 {
        #[derive(Debug, FromQueryResult)]
        struct CountRow {
            count: i64,
        }
        let uid = Uuid::parse_str(id).unwrap();
        CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql.to_owned(),
            [uid.into()],
        ))
        .one(database)
        .await
        .expect("count query")
        .map(|row| row.count)
        .unwrap_or(0)
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
                urdu_name: None,
                name: "Ledger Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    product_lot_id: None,
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
                    product_lot_id: None,
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
                    product_lot_id: None,
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

        let cid = Uuid::parse_str(&customer.id).unwrap();
        // Open credit 45 — sold 45, paid 0, list + dashboard all show 45.
        let open_totals = LedgerRepository::customer_credit_totals(&database, cid)
            .await
            .expect("open totals");
        assert_eq!(open_totals.balance, Decimal::new(45, 0));
        assert_eq!(open_totals.sold, Decimal::new(45, 0));
        assert_eq!(open_totals.paid, Decimal::ZERO);
        let listed = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("list customer")
            .expect("customer row");
        assert_eq!(listed.balance, Some(45.0));
        assert_eq!(listed.credit_sale_total, Some(45.0));
        assert_eq!(listed.collected_total, Some(0.0));
        let dash_open = FinanceService::dashboard(&database, &context)
            .await
            .expect("dashboard open");
        assert_eq!(dash_open.credit_outstanding, 45.0);
        assert_eq!(dash_open.invoice_total_today, 45.0);
        assert_eq!(dash_open.bills_today, 2);
        assert_eq!(dash_open.credit_today, 45.0);
        assert_eq!(dash_open.recent_bills.len(), 2);

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

        // Payment 20 → balance 25, sold 45, paid 20
        let pay = CreditService::customer_payment(
            &database,
            &context,
            cid,
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
        let paid_totals = LedgerRepository::customer_credit_totals(&database, cid)
            .await
            .expect("paid totals");
        assert_eq!(paid_totals.balance, Decimal::new(25, 0));
        assert_eq!(paid_totals.sold, Decimal::new(45, 0));
        assert_eq!(paid_totals.paid, Decimal::new(20, 0));
        let listed_paid = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("list customer after pay")
            .expect("customer row");
        assert_eq!(listed_paid.balance, Some(25.0));
        assert_eq!(listed_paid.credit_sale_total, Some(45.0));
        assert_eq!(listed_paid.collected_total, Some(20.0));
        let dash_paid = FinanceService::dashboard(&database, &context)
            .await
            .expect("dashboard paid");
        assert_eq!(dash_paid.credit_outstanding, 25.0);

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

    /// QA-02 part 2 §6 mix chain (exact amounts):
    /// SALE 30 → PAY 10 → revise 30→45 (ADJ −30, SALE 45) → RETURN 15 → SALE 15.
    /// QA stored RETURN after=−25 (stale ADJUSTMENT tip −10); hand-calc expects 20 then tip 35.
    #[tokio::test]
    async fn qa_mix_sale_pay_revise_return_sale_balance_after() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "MixQA".into(),
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
                name: "Mix Continuity Customer".into(),
                symbol: None,
                phone: Some("03009998877".into()),
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
                urdu_name: None,
                name: "Mix Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

        // 1) Credit sale 2 × 15 = 30
        let first = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "mix-sale-1".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("first sale");
        assert_eq!(first.credit_amount, 30.0);

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

        // 2) Pay 10 → 20
        CreditService::customer_payment(
            &database,
            &context,
            cid,
            CustomerPaymentRequest {
                amount: Decimal::new(10, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: Some("mix pay".into()),
                client_request_id: Some("mix-pay-1".into()),
            },
        )
        .await
        .expect("payment");

        // 3–4) Revise 2 → 3 @ 15 = 45: ADJUSTMENT −30 → −10, SALE 45 → 35.
        // Allocated customer payment (10) stays on the invoice → open credit 35.
        let revised = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&first.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "mix-revise-1".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(3, 0),
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
        .expect("revise to 45");
        assert_eq!(revised.total, 45.0);
        assert_eq!(revised.paid_amount, 10.0);
        assert_eq!(revised.credit_amount, 35.0);

        // 5) Return 15 against revised invoice → must read prior 35, not stale ADJ −10
        let return_item_id = revised.items[0].id.clone();
        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: revised.id.clone(),
                return_type: "REFUND".into(),
                reason: "mix return".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: return_item_id,
                    quantity: Decimal::ONE,
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(15, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("return");

        // 6) New credit sale 15 → tip 35
        SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "mix-sale-2".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("second sale");

        let expected = vec![30.0, 20.0, -10.0, 35.0, 20.0, 35.0];
        let actual = ledger_balances(&database, &customer.id).await;
        assert_eq!(actual, expected, "hand-calculated balance_after chain");

        #[derive(Debug, FromQueryResult)]
        struct TypeRow {
            entry_type: String,
            balance_after: f64,
        }
        let rows = TypeRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT type AS entry_type, CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at ASC, created_at ASC, rowid ASC",
            [cid.into()],
        ))
        .all(&database)
        .await
        .expect("typed rows");
        let types: Vec<&str> = rows.iter().map(|r| r.entry_type.as_str()).collect();
        assert_eq!(
            types,
            vec![
                "SALE",
                "PAYMENT_RECEIVED",
                "ADJUSTMENT",
                "SALE",
                "RETURN",
                "SALE"
            ]
        );
        assert_eq!(rows[4].balance_after, 20.0, "RETURN must be 20 not −25");

        // Deliberately recreate QA's broken RETURN tip (−25), then recompute repairs it.
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE customer_ledger_entries SET balance_after = -25 WHERE customer_id = ? AND type = 'RETURN'",
                [cid.into()],
            ))
            .await
            .expect("break return row");
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE customer_ledger_entries SET balance_after = -10 WHERE id = (
                    SELECT id FROM customer_ledger_entries WHERE customer_id = ?
                    ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1
                )",
                [cid.into()],
            ))
            .await
            .expect("break tip");
        assert_eq!(ledger_balances(&database, &customer.id).await[4], -25.0);
        LedgerRepository::recompute_balances(&database)
            .await
            .expect("recompute");
        assert_eq!(
            ledger_balances(&database, &customer.id).await,
            expected,
            "recompute must repair broken RETURN and tip"
        );

        // All-customers ledger list must use posting order (ADJUSTMENT then SALE).
        let listed = CreditService::list_customer_ledgers(
            &database,
            crate::backend::dto::CustomerLedgerListQuery {
                page: Default::default(),
                customer: Some(customer.name.clone()),
                entry_type: None,
                debit: None,
                credit: None,
                occurred_from: None,
                occurred_to: None,
            },
        )
        .await
        .expect("list ledgers");
        let types: Vec<&str> = listed.data.iter().map(|e| e.entry_type.as_str()).collect();
        let adj = types.iter().position(|t| *t == "ADJUSTMENT").expect("ADJ");
        assert_eq!(
            types.get(adj + 1).copied(),
            Some("SALE"),
            "revised SALE must follow ADJUSTMENT in posting order, got {types:?}"
        );
        // Adjacent balances must chain: each after = prior + debit − credit
        for window in listed.data.windows(2) {
            let prev = &window[0];
            let next = &window[1];
            assert!(
                (next.balance_after - (prev.balance_after + next.debit - next.credit)).abs()
                    < 0.005,
                "list balance continuity broken at {} → {}",
                prev.entry_type,
                next.entry_type
            );
        }
    }

    /// QA-02 part 2 #1: returns shrink invoice.creditAmount (and thus profit on hold).
    #[tokio::test]
    async fn credit_return_clears_invoice_credit_and_profit_hold() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "ReturnQA".into(),
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
                name: "Return Credit Cust".into(),
                symbol: None,
                phone: Some("03004445566".into()),
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
                urdu_name: None,
                name: "Return Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(500, 0),
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

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

        // (1) Full return on credit 40 → creditAmount 0, profit on hold 0
        let full = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ret-full-40".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect("sale 40");
        assert_eq!(full.credit_amount, 40.0);
        let before_hold = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .profit_on_hold
            .unwrap_or(0.0);
        assert!(before_hold > 0.0, "open credit must hold profit");

        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: full.id.clone(),
                return_type: "REFUND".into(),
                reason: "full return".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: full.items[0].id.clone(),
                    quantity: Decimal::new(2, 0),
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(40, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("full return");
        let after_full = SalesService::get(&database, Uuid::parse_str(&full.id).unwrap())
            .await
            .expect("invoice after full return");
        assert_eq!(after_full.credit_amount, 0.0);
        assert_eq!(
            after_full.payment_status, "RETURNED",
            "full credit return must not stay PAID"
        );
        // Sold 40, returned 40 → net sold 0; nothing collected → paid 0; balance 0.
        let full_totals = LedgerRepository::customer_credit_totals(&database, cid)
            .await
            .expect("full-return totals");
        assert_eq!(full_totals.sold, Decimal::ZERO);
        assert_eq!(full_totals.paid, Decimal::ZERO);
        assert_eq!(full_totals.balance, Decimal::ZERO);
        let after_cust = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row");
        assert_eq!(after_cust.profit_on_hold.unwrap_or(-1.0), 0.0);
        assert_eq!(after_cust.credit_sale_total, Some(0.0));
        assert_eq!(after_cust.collected_total, Some(0.0));
        assert!(
            after_cust.credit_sale_count.unwrap_or(0) >= 1,
            "returned credit invoice still counts as a credit sale"
        );
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            0.0
        );

        // (2) Partial return: sale 60, return 20 → creditAmount 40
        let partial_sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ret-partial-60".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(3, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect("sale 60");
        assert_eq!(partial_sale.credit_amount, 60.0);
        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: partial_sale.id.clone(),
                return_type: "REFUND".into(),
                reason: "partial return".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: partial_sale.items[0].id.clone(),
                    quantity: Decimal::ONE,
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(20, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("partial return");
        let after_partial =
            SalesService::get(&database, Uuid::parse_str(&partial_sale.id).unwrap())
                .await
                .expect("invoice after partial");
        assert_eq!(after_partial.credit_amount, 40.0);
        assert_eq!(
            after_partial.payment_status, "PARTIALLY_RETURNED",
            "partial credit return keeps open credit with returned status"
        );
        let hold_partial = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .profit_on_hold
            .unwrap_or(0.0);
        // Remaining credit 40 of 60 → 2/3 of that invoice's GP still on hold (> 0)
        assert!(hold_partial > 0.0);

        // (3) Sale 40, pay 10, return 15 → creditAmount 15, balance 15
        let pay_cust = MasterService::create(
            &database,
            MasterKind::Customer,
            MasterRequest {
                name: "Return Pay Cust".into(),
                symbol: None,
                phone: Some("03007778899".into()),
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
        .expect("pay cust");
        let pay_cid = Uuid::parse_str(&pay_cust.id).unwrap();
        let sale40 = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ret-pay-40".into(),
                customer_id: Some(pay_cust.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect("sale 40 pay-chain");
        CreditService::customer_payment(
            &database,
            &context,
            pay_cid,
            CustomerPaymentRequest {
                amount: Decimal::new(10, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: None,
                client_request_id: Some("ret-pay-10".into()),
            },
        )
        .await
        .expect("pay 10");
        let after_pay = SalesService::get(&database, Uuid::parse_str(&sale40.id).unwrap())
            .await
            .expect("after pay");
        assert_eq!(after_pay.credit_amount, 30.0);
        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: sale40.id.clone(),
                return_type: "REFUND".into(),
                reason: "return after pay".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: sale40.items[0].id.clone(),
                    quantity: Decimal::ONE,
                    // 1 of 2 @ 20 = 20 would overshoot the test amount; use explicit refund 15
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(15, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("return 15");
        let after_ret = SalesService::get(&database, Uuid::parse_str(&sale40.id).unwrap())
            .await
            .expect("after return");
        assert_eq!(after_ret.credit_amount, 15.0);
        assert_eq!(
            *ledger_balances(&database, &pay_cust.id)
                .await
                .last()
                .unwrap(),
            15.0
        );
        let totals = LedgerRepository::customer_credit_totals(&database, pay_cid)
            .await
            .expect("totals");
        assert_eq!(totals.balance, Decimal::new(15, 0));
    }

    /// Step 8: remaining profit = gross × (paid+credit)/total; hold/realized split by credit/paid.
    /// (b) sale 60 GP 30, return one line, pay 0 → hold 15.
    /// (c) sale 60 GP 30, pay 30, return one line → hold 0 (cash covers remaining).
    #[tokio::test]
    async fn credit_return_profit_hold_partial_and_paid_scenarios() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "ProfitQA".into(),
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
                name: "Profit Return Cust".into(),
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
        // Cost 15, price 30 → GP 15 per line (two lines = 30).
        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "Profit Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    cost: Decimal::new(15, 0),
                    min: Decimal::new(15, 0),
                    wholesale: Decimal::new(20, 0),
                    price: Decimal::new(30, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(500, 0),
                    cost: Decimal::new(15, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let unit_id = product.sell_units[0].id.clone();
        let cid = Uuid::parse_str(&customer.id).unwrap();

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

        // (b) two equal lines, return one, pay 0 → hold 15
        let sale_b = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "profit-b-60".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::ONE,
                        unit_price: Decimal::new(30, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::ONE,
                        unit_price: Decimal::new(30, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                ],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("sale b 60");
        assert_eq!(sale_b.credit_amount, 60.0);
        let gp_b: f64 = sale_b.items.iter().map(|i| i.gross_profit).sum();
        assert!((gp_b - 30.0).abs() < 0.01, "expected GP 30 got {gp_b}");

        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: sale_b.id.clone(),
                return_type: "REFUND".into(),
                reason: "return one line".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: sale_b.items[0].id.clone(),
                    quantity: Decimal::ONE,
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(30, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("return one line b");
        let after_b = SalesService::get(&database, Uuid::parse_str(&sale_b.id).unwrap())
            .await
            .expect("after b");
        assert_eq!(after_b.credit_amount, 30.0);
        assert_eq!(after_b.payment_status, "PARTIALLY_RETURNED");
        let hold_b = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .profit_on_hold
            .unwrap_or(-1.0);
        assert!(
            (hold_b - 15.0).abs() < 0.01,
            "case (b) hold must be 15, got {hold_b}"
        );

        // Fresh customer for (c): pay 30 then return one line → hold 0
        let cust_c = MasterService::create(
            &database,
            MasterKind::Customer,
            MasterRequest {
                name: "Profit Pay Return Cust".into(),
                symbol: None,
                phone: Some("03002223344".into()),
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
        .expect("customer c");
        let cid_c = Uuid::parse_str(&cust_c.id).unwrap();
        let sale_c = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "profit-c-60".into(),
                customer_id: Some(cust_c.id.clone()),
                items: vec![
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::ONE,
                        unit_price: Decimal::new(30, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::ONE,
                        unit_price: Decimal::new(30, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                ],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("sale c 60");
        CreditService::customer_payment(
            &database,
            &context,
            cid_c,
            CustomerPaymentRequest {
                amount: Decimal::new(30, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: None,
                client_request_id: Some("profit-c-pay".into()),
            },
        )
        .await
        .expect("pay 30");
        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: sale_c.id.clone(),
                return_type: "REFUND".into(),
                reason: "return after pay".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: sale_c.items[0].id.clone(),
                    quantity: Decimal::ONE,
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(30, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("return one line c");
        let after_c = SalesService::get(&database, Uuid::parse_str(&sale_c.id).unwrap())
            .await
            .expect("after c");
        assert_eq!(after_c.credit_amount, 0.0);
        assert_eq!(after_c.paid_amount, 30.0);
        assert_eq!(after_c.payment_status, "RETURNED");
        let hold_c = MasterRepository::find(&database, MasterKind::Customer, cid_c)
            .await
            .expect("cust c")
            .expect("row")
            .profit_on_hold
            .unwrap_or(-1.0);
        assert!(
            (hold_c - 0.0).abs() < 0.01,
            "case (c) hold must be 0, got {hold_c}"
        );
    }

    #[tokio::test]
    async fn returned_invoice_revise_is_rejected() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "RetEdit".into(),
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
                name: "Return Edit Cust".into(),
                symbol: None,
                phone: Some("03009998877".into()),
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
                urdu_name: None,
                name: "Return Edit Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
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

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "ret-edit-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect("credit sale");

        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: sale.id.clone(),
                return_type: "REFUND".into(),
                reason: "block edit".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: sale.items[0].id.clone(),
                    quantity: Decimal::new(2, 0),
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(40, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("full return");

        let after = SalesService::get(&database, Uuid::parse_str(&sale.id).unwrap())
            .await
            .expect("returned invoice");
        assert_eq!(after.payment_status, "RETURNED");

        let err = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "ret-edit-revise".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect_err("returned invoice must not revise");
        let msg = err.to_string();
        assert!(
            msg.to_lowercase().contains("returned"),
            "expected returned validation message, got {msg}"
        );
        // 422 path — Validation variant
        assert!(matches!(
            err,
            crate::backend::errors::AppError::Validation(_)
        ));
    }

    #[tokio::test]
    async fn void_returned_invoice_rejected() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let mut context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "Void Return Cat".into(),
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
                name: "Void Return Cust".into(),
                symbol: None,
                phone: Some("03008887766".into()),
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
                urdu_name: None,
                name: "Void Return Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    wholesale: Decimal::new(15, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
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

        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::new(100, 0),
            },
        )
        .await
        .expect("cash session");
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "void-ret-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
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
        .expect("credit sale");

        CreditService::create_return(
            &database,
            &context,
            CreateReturnRequest {
                invoice_id: sale.id.clone(),
                return_type: "REFUND".into(),
                reason: "block void".into(),
                notes: None,
                items: vec![ReturnItemInput {
                    invoice_item_id: sale.items[0].id.clone(),
                    quantity: Decimal::new(2, 0),
                    condition: "GOOD".into(),
                    refund_amount: Decimal::new(40, 0),
                    original_product_lot_id: None,
                }],
                replacements: vec![],
            },
        )
        .await
        .expect("full return");

        let after = SalesService::get(&database, Uuid::parse_str(&sale.id).unwrap())
            .await
            .expect("returned invoice");
        assert_eq!(after.payment_status, "RETURNED");

        let err = SalesService::void(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            crate::backend::dto::VoidRequest {
                reason: "should fail".into(),
            },
        )
        .await
        .expect_err("returned invoice must not void");
        assert!(
            err.to_string().to_lowercase().contains("void"),
            "expected void rejection, got {err}"
        );
        assert!(matches!(
            err,
            crate::backend::errors::AppError::Validation(_)
        ));
    }

    #[tokio::test]
    async fn revise_noop_keeps_ledger_credit_and_profit_hold() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "NoopRev".into(),
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
                name: "Noop Revise Cust".into(),
                symbol: None,
                phone: Some("03007776655".into()),
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
                urdu_name: None,
                name: "Noop Revise Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

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

        // Credit 30 with 5 paid → open credit 25
        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "noop-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
                payments: vec![crate::backend::dto::SalePaymentInput {
                    amount: Decimal::new(5, 0),
                    amount_tendered: Some(Decimal::new(5, 0)),
                    payment_method: "CASH".into(),
                    reference_number: None,
                    notes: None,
                    client_request_id: None,
                }],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("partial credit sale");
        assert_eq!(sale.total, 30.0);
        assert_eq!(sale.paid_amount, 5.0);
        assert_eq!(sale.credit_amount, 25.0);

        let ledger_before = ledger_balances(&database, &customer.id).await;
        let ledger_count_before = count_rows(
            &database,
            "SELECT COUNT(*) AS count FROM customer_ledger_entries WHERE customer_id = ?",
            &customer.id,
        )
        .await;
        let payment_count_before = count_rows(
            &database,
            "SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ?",
            &sale.id,
        )
        .await;
        let movement_count_before = count_rows(
            &database,
            "SELECT COUNT(*) AS count FROM stock_movements WHERE reference_type = 'Invoice' AND reference_id = ?",
            &sale.id,
        )
        .await;
        let hold_before = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .profit_on_hold
            .unwrap_or(0.0);

        let revised = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "noop-revise".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(15, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![crate::backend::dto::SalePaymentInput {
                    amount: Decimal::new(5, 0),
                    amount_tendered: Some(Decimal::new(5, 0)),
                    payment_method: "CASH".into(),
                    reference_number: None,
                    notes: None,
                    client_request_id: None,
                }],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("noop revise");

        assert_eq!(revised.credit_amount, 25.0);
        assert_eq!(revised.paid_amount, 5.0);
        assert_eq!(revised.total, 30.0);
        let ledger_after = ledger_balances(&database, &customer.id).await;
        assert_eq!(
            ledger_after, ledger_before,
            "balance_after chain must be identical on no-op revise"
        );
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM customer_ledger_entries WHERE customer_id = ?",
                &customer.id,
            )
            .await,
            ledger_count_before,
            "no-op revise must not add ledger rows"
        );
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ?",
                &sale.id,
            )
            .await,
            payment_count_before,
            "no-op revise must not add payment rows"
        );
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM stock_movements WHERE reference_type = 'Invoice' AND reference_id = ?",
                &sale.id,
            )
            .await,
            movement_count_before,
            "no-op revise must not add stock movements"
        );
        let hold_after = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .profit_on_hold
            .unwrap_or(0.0);
        assert!(
            (hold_after - hold_before).abs() < 0.01,
            "profit hold changed: {hold_before} → {hold_after}"
        );
    }

    #[tokio::test]
    async fn revise_noop_split_keeps_payment_rows() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "SplitNoop".into(),
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
                name: "Split Noop Cust".into(),
                symbol: None,
                phone: Some("03006665544".into()),
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
                urdu_name: None,
                name: "Split Noop Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    wholesale: Decimal::new(15, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
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

        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::ZERO,
            },
        )
        .await
        .expect("cash");
        let mut context = context;
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "split-noop-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![
                    crate::backend::dto::SalePaymentInput {
                        amount: Decimal::new(20, 0),
                        amount_tendered: Some(Decimal::new(20, 0)),
                        payment_method: "CASH".into(),
                        reference_number: None,
                        notes: None,
                        client_request_id: None,
                    },
                    crate::backend::dto::SalePaymentInput {
                        amount: Decimal::new(20, 0),
                        amount_tendered: None,
                        payment_method: "MOBILE".into(),
                        reference_number: None,
                        notes: None,
                        client_request_id: None,
                    },
                ],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("split sale");
        assert_eq!(sale.total, 40.0);
        assert_eq!(sale.paid_amount, 40.0);
        assert_eq!(sale.payments.len(), 2);

        let payment_count_before = count_rows(
            &database,
            "SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ? AND status != 'VOIDED'",
            &sale.id,
        )
        .await;
        assert_eq!(payment_count_before, 2);

        let revised = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "split-noop-revise".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
                    quantity: Decimal::new(2, 0),
                    unit_price: Decimal::new(20, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![
                    crate::backend::dto::SalePaymentInput {
                        amount: Decimal::new(20, 0),
                        amount_tendered: Some(Decimal::new(20, 0)),
                        payment_method: "CASH".into(),
                        reference_number: None,
                        notes: None,
                        client_request_id: None,
                    },
                    crate::backend::dto::SalePaymentInput {
                        amount: Decimal::new(20, 0),
                        amount_tendered: None,
                        payment_method: "MOBILE".into(),
                        reference_number: None,
                        notes: None,
                        client_request_id: None,
                    },
                ],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("split noop revise");

        assert_eq!(revised.payments.len(), 2);
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ? AND status != 'VOIDED'",
                &sale.id,
            )
            .await,
            2,
            "split no-op must keep both payment rows"
        );
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ? AND status = 'VOIDED'",
                &sale.id,
            )
            .await,
            0,
            "split no-op must not void payments"
        );
    }

    /// INV-0004 style: credit sale, later customer payment allocates into paid_amount
    /// with no invoice payment row. Raising qty must not invent a cash tender.
    #[tokio::test]
    async fn revise_allocated_credit_preserves_allocation_and_balance_delta() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "AllocRev".into(),
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
                name: "Alloc Revise Cust".into(),
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
                urdu_name: None,
                name: "Alloc Revise Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

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

        // Full credit 30 (no sale tender).
        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "alloc-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("credit sale");
        assert_eq!(sale.total, 30.0);
        assert_eq!(sale.paid_amount, 0.0);
        assert_eq!(sale.credit_amount, 30.0);
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            30.0
        );

        // Customer payment 5 → allocates onto this invoice (paid 5 / credit 25).
        CreditService::customer_payment(
            &database,
            &context,
            cid,
            CustomerPaymentRequest {
                amount: Decimal::new(5, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: None,
                client_request_id: Some("alloc-pay".into()),
            },
        )
        .await
        .expect("customer payment");
        let after_pay = SalesService::get(&database, Uuid::parse_str(&sale.id).unwrap())
            .await
            .expect("reload");
        assert_eq!(after_pay.paid_amount, 5.0);
        assert_eq!(after_pay.credit_amount, 25.0);
        assert_eq!(
            after_pay.payments.len(),
            0,
            "allocation must not create invoice payment"
        );
        assert_eq!(
            *ledger_balances(&database, &customer.id)
                .await
                .last()
                .unwrap(),
            25.0
        );
        let collected_before = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .collected_total
            .unwrap_or(0.0);
        assert!((collected_before - 5.0).abs() < 0.01);

        // No-op revise with payments=[] must not churn ledger (allocation ≠ cash tender).
        let ledger_count_before = count_rows(
            &database,
            "SELECT COUNT(*) AS count FROM customer_ledger_entries WHERE customer_id = ?",
            &customer.id,
        )
        .await;
        let _ = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "alloc-noop".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("alloc noop");
        assert_eq!(
            count_rows(
                &database,
                "SELECT COUNT(*) AS count FROM customer_ledger_entries WHERE customer_id = ?",
                &customer.id,
            )
            .await,
            ledger_count_before,
            "allocation-only no-op must not add ledger rows"
        );

        // Qty 2→3 (total 30→45): balance +15 (25→40); paid stays 5; no new invoice payment.
        let revised = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "alloc-revise-up".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id.clone(),
                    quantity: Decimal::new(3, 0),
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
        .expect("revise up");
        assert_eq!(revised.total, 45.0);
        assert_eq!(
            revised.paid_amount, 5.0,
            "allocation must stay on the invoice"
        );
        assert_eq!(revised.credit_amount, 40.0);
        assert_eq!(
            revised
                .payments
                .iter()
                .filter(|p| p.status != "VOIDED")
                .count(),
            0,
            "must not create a new cash payment for the allocated 5"
        );
        let balances = ledger_balances(&database, &customer.id).await;
        // Hand-calc: after pay balance 25; reverse SALE 30 → −5; post SALE 45 → 40 (+15).
        assert_eq!(*balances.last().unwrap(), 40.0);
        let collected_after = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row")
            .collected_total
            .unwrap_or(0.0);
        assert!(
            (collected_after - collected_before).abs() < 0.01,
            "Paid on credit / collected must stay {collected_before}, got {collected_after}"
        );
    }

    #[tokio::test]
    async fn revise_rejects_total_below_allocated_customer_payment() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "AllocLow".into(),
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
                name: "Alloc Low Cust".into(),
                symbol: None,
                phone: Some("03009998877".into()),
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
                urdu_name: None,
                name: "Alloc Low Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

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

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "alloc-low-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("credit sale");

        CreditService::customer_payment(
            &database,
            &context,
            cid,
            CustomerPaymentRequest {
                amount: Decimal::new(5, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: None,
                client_request_id: Some("alloc-low-pay".into()),
            },
        )
        .await
        .expect("customer payment");

        // total 4 < allocated 5 → blocked (does not invent advance).
        let err = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "alloc-low-revise".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
                    quantity: Decimal::ONE,
                    unit_price: Decimal::new(4, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: true,
                    authorized_by: Some(SEED_USER_ID.into()),
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
        .expect_err("must reject total below allocated");
        match err {
            crate::backend::errors::AppError::Validation(msg) => {
                assert!(
                    msg.contains("already applied from customer payments")
                        || msg.contains("Cannot reduce"),
                    "unexpected message: {msg}"
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn revise_rejects_credit_customer_change_to_walk_in() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "WalkRev".into(),
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
                name: "Credit Keep Cust".into(),
                symbol: None,
                phone: Some("03005554433".into()),
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
        let walk_in = MasterService::create(
            &database,
            MasterKind::Customer,
            MasterRequest {
                name: "Walk-in".into(),
                symbol: None,
                phone: None,
                email: None,
                address: None,
                city_id: None,
                notes: None,
                is_active: true,
                precision: None,
                is_walk_in: true,
                in_credit_book: None,
                previous_balance: None,
            },
            Some(&context),
        )
        .await
        .expect("walk-in");
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
                urdu_name: None,
                name: "Walk Revise Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    quantity: Decimal::new(100, 0),
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

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "walk-credit-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
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
        .expect("credit sale");
        assert_eq!(sale.credit_amount, 30.0);

        let err = SalesService::revise(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            CompleteSaleRequest {
                client_request_id: "walk-credit-revise".into(),
                customer_id: Some(walk_in.id),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
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
        .expect_err("walk-in with open credit must fail");
        assert!(matches!(
            err,
            crate::backend::errors::AppError::Validation(_)
        ));
        assert!(err.to_string().to_lowercase().contains("walk-in"));
    }

    /// Backend must reject overselling even if the POS UI shows stale Left stock.
    #[tokio::test]
    async fn complete_rejects_insufficient_stock() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let mut context = ctx();
        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::new(1000, 0),
            },
        )
        .await
        .expect("open cash session");
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());
        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "OversellCat".into(),
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
                urdu_name: None,
                name: "Oversell Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    quantity: Decimal::new(5, 0),
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

        let err = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "oversell-sale".into(),
                customer_id: None,
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id,
                    product_unit_id: unit_id,
                    quantity: Decimal::new(6, 0),
                    unit_price: Decimal::new(15, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![SalePaymentInput {
                    amount: Decimal::new(90, 0),
                    amount_tendered: Some(Decimal::new(90, 0)),
                    payment_method: "CASH".into(),
                    reference_number: None,
                    notes: None,
                    client_request_id: None,
                }],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect_err("must reject oversell");
        assert!(
            matches!(err, crate::backend::errors::AppError::Conflict(_)),
            "expected Conflict, got {err:?}"
        );
        assert!(
            err.to_string().to_lowercase().contains("insufficient")
                || err.to_string().to_lowercase().contains("stock"),
            "message={err}"
        );
    }

    /// QA-06: void keeps creditAmount for audit, but open-credit / profit-hold queries exclude CANCELLED.
    #[tokio::test]
    async fn voided_credit_invoice_keeps_credit_amount_but_excludes_from_open_credit() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "VoidCredit".into(),
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
                name: "Void Credit Cust".into(),
                symbol: None,
                phone: Some("03009998877".into()),
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
                urdu_name: None,
                name: "Void Credit Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    min: Decimal::new(8, 0),
                    wholesale: Decimal::new(10, 0),
                    price: Decimal::new(15, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(50, 0),
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
        let cid = Uuid::parse_str(&customer.id).unwrap();

        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::ZERO,
            },
        )
        .await
        .expect("cash session");
        let mut context = context;
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "void-credit-sale".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_lot_id: None,
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
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
        .expect("credit sale");
        assert_eq!(sale.credit_amount, 30.0);
        let before = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row");
        assert_eq!(before.open_credit_sale_count.unwrap_or(0), 1);
        assert!(before.profit_on_hold.unwrap_or(0.0) > 0.0);

        let voided = SalesService::void(
            &database,
            &context,
            Uuid::parse_str(&sale.id).unwrap(),
            crate::backend::dto::VoidRequest {
                reason: "QA void credit".into(),
            },
        )
        .await
        .expect("void");
        assert_eq!(voided.status, "CANCELLED");
        // Safer option: keep original creditAmount for audit (do not zero on void).
        assert_eq!(voided.credit_amount, 30.0);

        let after = MasterRepository::find(&database, MasterKind::Customer, cid)
            .await
            .expect("cust")
            .expect("row");
        assert_eq!(
            after.open_credit_sale_count.unwrap_or(-1),
            0,
            "CANCELLED must be excluded from open credit count"
        );
        assert_eq!(
            after.profit_on_hold.unwrap_or(-1.0),
            0.0,
            "CANCELLED must be excluded from profit on hold"
        );
    }

    /// Step 27: bill discount must allocate into line gross_profit (was: line_total − fifo only).
    #[tokio::test]
    async fn bill_discount_allocates_into_line_gross_profit() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "BillDiscQA".into(),
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
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("units")
            .data
            .into_iter()
            .next()
            .expect("seed unit");
        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "Bill Disc Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    min: Decimal::new(8, 0),
                    wholesale: Decimal::new(15, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
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

        // A: 10@20=200 fifo 80 (cost 8); B: 5@30=150 fifo 40.
        // Hand: subtotal 350, bill disc 35 → shares 20/15 → GP 100+95=195
        // (pre-fix sum would be 230 = line_total − fifo with no bill share).
        let sale = SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "bill-disc-gp".into(),
                customer_id: None,
                items: vec![
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::new(10, 0),
                        unit_price: Decimal::new(20, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                    SaleItemInput {
                        product_lot_id: None,
                        product_id: product.id.clone(),
                        product_unit_id: unit_id.clone(),
                        quantity: Decimal::new(5, 0),
                        unit_price: Decimal::new(30, 0),
                        price_mode: "RETAIL".into(),
                        sold_below_minimum: false,
                        authorized_by: None,
                        discount: Decimal::ZERO,
                        tax: Decimal::ZERO,
                    },
                ],
                payments: vec![SalePaymentInput {
                    amount: Decimal::new(315, 0),
                    amount_tendered: Some(Decimal::new(315, 0)),
                    payment_method: "CASH".into(),
                    reference_number: None,
                    notes: None,
                    client_request_id: None,
                }],
                discount: Decimal::new(35, 0),
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("sale with bill discount");

        assert_eq!(sale.subtotal, 350.0);
        assert_eq!(sale.discount, 35.0);
        assert_eq!(sale.total, 315.0);
        assert_eq!(sale.items.len(), 2);
        let gp0 = sale.items[0].gross_profit;
        let gp1 = sale.items[1].gross_profit;
        let gp_sum: f64 = sale.items.iter().map(|i| i.gross_profit).sum();
        assert!(
            (gp0 - 100.0).abs() < 0.02,
            "line A GP expected 100 got {gp0}"
        );
        assert!((gp1 - 95.0).abs() < 0.02, "line B GP expected 95 got {gp1}");
        assert!(
            (gp_sum - 195.0).abs() < 0.02,
            "sum GP expected 195 (not pre-fix 230), got {gp_sum}"
        );
        // Sanity: fifo costs match opening cost × base qty
        assert!((sale.items[0].fifo_cost - 80.0).abs() < 0.02);
        assert!((sale.items[1].fifo_cost - 40.0).abs() < 0.02);

        let full_list = SalesService::list(&database, Default::default())
            .await
            .expect("list hydrated invoices");
        assert_eq!(full_list.data.len(), 1);
        assert_eq!(full_list.data[0].items.len(), 2);
        assert_eq!(full_list.data[0].payments.len(), 1);
        let headers = SalesService::list(
            &database,
            crate::backend::dto::InvoiceListQuery {
                include_details: Some(false),
                ..Default::default()
            },
        )
        .await
        .expect("list invoice headers");
        assert_eq!(headers.data[0].total, sale.total);
        assert!(headers.data[0].items.is_empty());
        assert!(headers.data[0].payments.is_empty());
    }
}
