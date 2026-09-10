use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{INVOICE_STATUS_COMPLETED, PAYMENT_DIRECTION_OUT},
    context::RequestContext,
    dto::{
        AnalyticsDaySales, AnalyticsQuery, AnalyticsReportResponse, AnalyticsTopProduct,
        CreateExpenseCategoryRequest, CreateExpenseRequest, DashboardReportResponse,
        ExpenseCategoryResponse, ExpenseListQuery, ExpenseResponse, LocalizationSettingsResponse,
        MoneyTransactionResponse, ProfileSettingsResponse, ReceiptSettingsQuery,
        ReceiptSettingsResponse, TransactionListQuery, UpdateLocalizationRequest,
        UpdateProfileRequest, UpdateReceiptRequest,
    },
    errors::AppError,
    util::{money_value, now_utc, parse_date, parse_uuid, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct DecimalRow {
    value: Option<Decimal>,
}

#[derive(Debug, FromQueryResult)]
struct CategoryRow {
    id: Uuid,
    name: String,
    is_active: i64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct ExpenseRow {
    id: Uuid,
    branch_id: Uuid,
    category_id: Uuid,
    amount: Decimal,
    payment_method: String,
    description: String,
    expense_date: chrono::NaiveDate,
    money_transaction_id: Uuid,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct MoneyRow {
    id: Uuid,
    branch_id: Uuid,
    cash_session_id: Option<Uuid>,
    direction: String,
    transaction_type: String,
    amount: Decimal,
    payment_method: String,
    reference_type: String,
    reference_id: String,
    party_type: Option<String>,
    party_id: Option<Uuid>,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct DaySalesRow {
    day: String,
    total: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct TopProductRow {
    product_id: Uuid,
    product_name: String,
    quantity: Decimal,
    revenue: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct LocalizationRow {
    id: Uuid,
    currency_symbol: String,
    currency_code: String,
    language: String,
    expiry_reminder_days: i32,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct ReceiptRow {
    id: Uuid,
    branch_id: Uuid,
    paper_width: String,
    shop_name: String,
    header_display: String,
    show_logo: i64,
    tagline: Option<String>,
    contact_line: Option<String>,
    footer_note: Option<String>,
    show_customer_balance: i64,
    show_item_discount: i64,
    show_cashier_name: i64,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct BranchRow {
    id: Uuid,
    name: String,
    phone: Option<String>,
}

pub struct FinanceRepository;

impl FinanceRepository {
    pub async fn list_expense_categories(
        database: &DatabaseConnection,
    ) -> Result<Vec<ExpenseCategoryResponse>, AppError> {
        let rows = CategoryRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, name, is_active, created_at, updated_at FROM expense_categories WHERE deleted_at IS NULL ORDER BY name ASC",
            [],
        ))
        .all(database)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| ExpenseCategoryResponse {
                id: row.id.to_string(),
                name: row.name,
                is_active: row.is_active != 0,
                created_at: row.created_at.to_rfc3339(),
                updated_at: row.updated_at.to_rfc3339(),
            })
            .collect())
    }

    pub async fn create_expense_category(
        database: &DatabaseConnection,
        request: &CreateExpenseCategoryRequest,
    ) -> Result<ExpenseCategoryResponse, AppError> {
        let id = Uuid::new_v4();
        let now = now_utc();
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO expense_categories (id, name, is_active, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, 1, 1, NULL, NULL, ?, ?)",
                [
                    id.into(),
                    request.name.trim().to_owned().into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(ExpenseCategoryResponse {
            id: id.to_string(),
            name: request.name.trim().to_owned(),
            is_active: true,
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        })
    }

    pub async fn list_expenses(
        database: &DatabaseConnection,
        query: &ExpenseListQuery,
    ) -> Result<(Vec<ExpenseResponse>, u64), AppError> {
        let mut parts = vec!["1=1".to_owned()];
        let mut values: Vec<sea_orm::Value> = Vec::new();
        if let Some(branch_id) = &query.branch_id {
            parts.push("branch_id = ?".to_owned());
            values.push(parse_uuid(branch_id, "branchId")?.into());
        }
        if let Some(category_id) = &query.category_id {
            parts.push("category_id = ?".to_owned());
            values.push(parse_uuid(category_id, "categoryId")?.into());
        }
        let conditions = parts.join(" AND ");
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM expenses WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        values.push((query.page.per_page as i64).into());
        values.push((query.page.offset() as i64).into());
        let rows = ExpenseRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, branch_id, category_id, amount, payment_method, description, expense_date, money_transaction_id, created_at FROM expenses WHERE {conditions} ORDER BY expense_date DESC, created_at DESC LIMIT ? OFFSET ?"
            ),
            values,
        ))
        .all(database)
        .await?;
        Ok((
            rows.into_iter()
                .map(|row| ExpenseResponse {
                    id: row.id.to_string(),
                    branch_id: row.branch_id.to_string(),
                    category_id: row.category_id.to_string(),
                    amount: decimal(row.amount),
                    payment_method: row.payment_method,
                    description: row.description,
                    expense_date: row.expense_date.to_string(),
                    money_transaction_id: row.money_transaction_id.to_string(),
                    created_at: row.created_at.to_rfc3339(),
                })
                .collect(),
            count,
        ))
    }

    pub async fn create_expense(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CreateExpenseRequest,
    ) -> Result<ExpenseResponse, AppError> {
        let cash_session_id = context.require_cash_session()?;
        let category_id = parse_uuid(&request.category_id, "categoryId")?;
        let now = now_utc();
        let amount = money_value(request.amount);
        let method = request.payment_method.trim().to_uppercase();
        if !matches!(method.as_str(), "CASH" | "CARD" | "BANK" | "MOBILE" | "OTHER") {
            return Err(AppError::Validation("Invalid paymentMethod.".into()));
        }
        let expense_date = match &request.expense_date {
            Some(value) => parse_date(value, "expenseDate must be YYYY-MM-DD.")?,
            None => now.date_naive(),
        };
        let money_id = Uuid::new_v4();
        let expense_id = Uuid::new_v4();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, 'EXPENSE', ?, ?, 'Expense', ?, NULL, NULL, ?, ?, ?, ?)",
                [
                    money_id.into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    PAYMENT_DIRECTION_OUT.into(),
                    amount.into(),
                    method.clone().into(),
                    expense_id.into(),
                    request.description.trim().to_owned().into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO expenses (id, branch_id, cash_session_id, category_id, amount, payment_method, description, expense_date, money_transaction_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    expense_id.into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    category_id.into(),
                    amount.into(),
                    method.clone().into(),
                    request.description.trim().to_owned().into(),
                    expense_date.into(),
                    money_id.into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(ExpenseResponse {
            id: expense_id.to_string(),
            branch_id: context.branch_id.to_string(),
            category_id: category_id.to_string(),
            amount: decimal(amount),
            payment_method: method,
            description: request.description.trim().to_owned(),
            expense_date: expense_date.to_string(),
            money_transaction_id: money_id.to_string(),
            created_at: now.to_rfc3339(),
        })
    }

    pub async fn list_transactions(
        database: &DatabaseConnection,
        query: &TransactionListQuery,
    ) -> Result<(Vec<MoneyTransactionResponse>, u64), AppError> {
        let mut parts = vec!["1=1".to_owned()];
        let mut values: Vec<sea_orm::Value> = Vec::new();
        if let Some(branch_id) = &query.branch_id {
            parts.push("branch_id = ?".to_owned());
            values.push(parse_uuid(branch_id, "branchId")?.into());
        }
        if let Some(direction) = &query.direction {
            parts.push("direction = ?".to_owned());
            values.push(direction.trim().to_uppercase().into());
        }
        if let Some(tx_type) = &query.transaction_type {
            parts.push("type = ?".to_owned());
            values.push(tx_type.trim().to_uppercase().into());
        }
        let conditions = parts.join(" AND ");
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM money_transactions WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        values.push((query.page.per_page as i64).into());
        values.push((query.page.offset() as i64).into());
        let rows = MoneyRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, branch_id, cash_session_id, direction, type AS transaction_type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_at FROM money_transactions WHERE {conditions} ORDER BY occurred_at DESC LIMIT ? OFFSET ?"
            ),
            values,
        ))
        .all(database)
        .await?;
        Ok((
            rows.into_iter()
                .map(|row| MoneyTransactionResponse {
                    id: row.id.to_string(),
                    branch_id: row.branch_id.to_string(),
                    cash_session_id: row.cash_session_id.map(|v| v.to_string()),
                    direction: row.direction,
                    transaction_type: row.transaction_type,
                    amount: decimal(row.amount),
                    payment_method: row.payment_method,
                    reference_type: row.reference_type,
                    reference_id: row.reference_id,
                    party_type: row.party_type,
                    party_id: row.party_id.map(|v| v.to_string()),
                    notes: row.notes,
                    occurred_at: row.occurred_at.to_rfc3339(),
                    created_at: row.created_at.to_rfc3339(),
                })
                .collect(),
            count,
        ))
    }

    pub async fn dashboard(
        database: &DatabaseConnection,
        branch_id: Uuid,
    ) -> Result<DashboardReportResponse, AppError> {
        let today = now_utc().date_naive().to_string();
        let today_sales = DecimalRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COALESCE(SUM(total), 0) AS value FROM invoices WHERE branch_id = ? AND status = ? AND deleted_at IS NULL AND date(completed_at) = ?",
            [
                branch_id.into(),
                INVOICE_STATUS_COMPLETED.into(),
                today.into(),
            ],
        ))
        .one(database)
        .await?
        .and_then(|row| row.value)
        .unwrap_or(Decimal::ZERO);

        let credit = DecimalRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COALESCE(SUM(balance_after), 0) AS value FROM (
                SELECT customer_id, balance_after,
                       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY occurred_at DESC, created_at DESC) AS rn
                FROM customer_ledger_entries
              ) t WHERE rn = 1 AND balance_after > 0",
            [],
        ))
        .one(database)
        .await;
        // SQLite may not support window functions on older builds; fall back
        let credit_outstanding = match credit {
            Ok(Some(row)) => row.value.unwrap_or(Decimal::ZERO),
            _ => {
                DecimalRow::find_by_statement(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT COALESCE(SUM(debit - credit), 0) AS value FROM customer_ledger_entries",
                    [],
                ))
                .one(database)
                .await?
                .and_then(|row| row.value)
                .unwrap_or(Decimal::ZERO)
            }
        };

        let low_stock = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM (
                SELECT p.id FROM products p
                LEFT JOIN (
                  SELECT pl.product_id, SUM(bl.remaining_base_quantity) AS remaining
                  FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id
                  WHERE bl.branch_id = ? AND pl.deleted_at IS NULL
                  GROUP BY pl.product_id
                ) s ON s.product_id = p.id
                WHERE p.deleted_at IS NULL AND p.is_active = 1
                  AND COALESCE(s.remaining, 0) <= p.minimum_stock
              )",
            [branch_id.into()],
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);

        let open_repairs = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM repair_jobs WHERE branch_id = ? AND status IN ('RECEIVED','IN_PROGRESS','READY')",
            [branch_id.into()],
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);

        Ok(DashboardReportResponse {
            today_sales_total: decimal(today_sales),
            credit_outstanding: decimal(credit_outstanding),
            low_stock_count: low_stock,
            open_repairs,
        })
    }

    pub async fn analytics(
        database: &DatabaseConnection,
        query: &AnalyticsQuery,
    ) -> Result<AnalyticsReportResponse, AppError> {
        let from = query
            .from
            .as_deref()
            .map(|v| parse_date(v, "from must be YYYY-MM-DD."))
            .transpose()?
            .unwrap_or_else(|| now_utc().date_naive() - chrono::Duration::days(30));
        let to = query
            .to
            .as_deref()
            .map(|v| parse_date(v, "to must be YYYY-MM-DD."))
            .transpose()?
            .unwrap_or_else(|| now_utc().date_naive());

        let sales_by_day = DaySalesRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT date(completed_at) AS day, COALESCE(SUM(total), 0) AS total FROM invoices WHERE status = ? AND deleted_at IS NULL AND date(completed_at) >= ? AND date(completed_at) <= ? GROUP BY date(completed_at) ORDER BY day ASC",
            [
                INVOICE_STATUS_COMPLETED.into(),
                from.to_string().into(),
                to.to_string().into(),
            ],
        ))
        .all(database)
        .await?;

        let top_products = TopProductRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT ii.product_id, ii.product_name, COALESCE(SUM(ii.base_quantity), 0) AS quantity, COALESCE(SUM(ii.line_total), 0) AS revenue FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.status = ? AND i.deleted_at IS NULL AND date(i.completed_at) >= ? AND date(i.completed_at) <= ? GROUP BY ii.product_id, ii.product_name ORDER BY revenue DESC LIMIT 10",
            [
                INVOICE_STATUS_COMPLETED.into(),
                from.to_string().into(),
                to.to_string().into(),
            ],
        ))
        .all(database)
        .await?;

        Ok(AnalyticsReportResponse {
            sales_by_day: sales_by_day
                .into_iter()
                .map(|row| AnalyticsDaySales {
                    day: row.day,
                    total: decimal(row.total),
                })
                .collect(),
            top_products: top_products
                .into_iter()
                .map(|row| AnalyticsTopProduct {
                    product_id: row.product_id.to_string(),
                    product_name: row.product_name,
                    quantity: decimal(row.quantity),
                    revenue: decimal(row.revenue),
                })
                .collect(),
        })
    }

    pub async fn get_localization(
        database: &DatabaseConnection,
    ) -> Result<LocalizationSettingsResponse, AppError> {
        let row = LocalizationRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, currency_symbol, currency_code, language, expiry_reminder_days, updated_at FROM localization_settings LIMIT 1",
            [],
        ))
        .one(database)
        .await?;
        if let Some(row) = row {
            return Ok(map_localization(row));
        }
        let id = Uuid::new_v4();
        let now = now_utc();
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO localization_settings (id, currency_symbol, currency_code, language, expiry_reminder_days, created_at, updated_at) VALUES (?, 'Rs', 'PKR', 'EN', 30, ?, ?)",
                [id.into(), now.into(), now.into()],
            ))
            .await?;
        Ok(LocalizationSettingsResponse {
            id: id.to_string(),
            currency_symbol: "Rs".into(),
            currency_code: "PKR".into(),
            language: "EN".into(),
            expiry_reminder_days: 30,
            updated_at: now.to_rfc3339(),
        })
    }

    pub async fn update_localization(
        database: &DatabaseConnection,
        request: &UpdateLocalizationRequest,
    ) -> Result<LocalizationSettingsResponse, AppError> {
        let current = Self::get_localization(database).await?;
        let now = now_utc();
        let symbol = request
            .currency_symbol
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&current.currency_symbol);
        let code = request
            .currency_code
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&current.currency_code);
        let language = request
            .language
            .as_deref()
            .map(|v| v.trim().to_uppercase())
            .unwrap_or_else(|| current.language.clone());
        if language != "EN" && language != "UR" {
            return Err(AppError::Validation("language must be EN or UR.".into()));
        }
        let days = request
            .expiry_reminder_days
            .unwrap_or(current.expiry_reminder_days);
        if days < 0 {
            return Err(AppError::Validation(
                "expiryReminderDays cannot be negative.".into(),
            ));
        }
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE localization_settings SET currency_symbol = ?, currency_code = ?, language = ?, expiry_reminder_days = ?, updated_at = ? WHERE id = ?",
                [
                    symbol.into(),
                    code.into(),
                    language.into(),
                    days.into(),
                    now.into(),
                    parse_uuid(&current.id, "id")?.into(),
                ],
            ))
            .await?;
        Self::get_localization(database).await
    }

    pub async fn get_receipt(
        database: &DatabaseConnection,
        query: &ReceiptSettingsQuery,
        fallback_branch: Uuid,
    ) -> Result<ReceiptSettingsResponse, AppError> {
        let branch_id = match &query.branch_id {
            Some(value) => parse_uuid(value, "branchId")?,
            None => fallback_branch,
        };
        if let Some(row) = load_receipt(database, branch_id).await? {
            return Ok(map_receipt(row));
        }
        let now = now_utc();
        let id = Uuid::new_v4();
        let branch = BranchRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, name, phone FROM branches WHERE id = ? LIMIT 1",
            [branch_id.into()],
        ))
        .one(database)
        .await?
        .ok_or(AppError::NotFound(
            crate::backend::constants::ERROR_BRANCH_NOT_FOUND,
        ))?;
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO receipt_settings (id, branch_id, paper_width, shop_name, shop_name_size_pt, shop_name_bold, header_display, show_logo, logo_path, logo_height_pt, font_family, body_size_pt, items_table_bordered, tagline, tagline_align, tagline_size_pt, contact_line, contact_align, contact_size_pt, promo_urdu, promo_align, promo_size_pt, promo_bold, footer_note, footer_note_size_pt, footer_note_bold, software_credit, software_credit_size_pt, show_customer_balance, show_item_discount, show_cashier_name, created_at, updated_at) VALUES (?, ?, 'MM_80', ?, 16, 1, 'SHOP_NAME', 1, NULL, 40, 'Arial', 10, 1, NULL, 'CENTER', 10, ?, 'CENTER', 10, NULL, 'CENTER', 14, 1, NULL, 9, 1, NULL, 8, 1, 0, 1, ?, ?)",
                [
                    id.into(),
                    branch_id.into(),
                    branch.name.clone().into(),
                    branch.phone.clone().into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(ReceiptSettingsResponse {
            id: id.to_string(),
            branch_id: branch_id.to_string(),
            paper_width: "MM_80".into(),
            shop_name: branch.name,
            header_display: "SHOP_NAME".into(),
            show_logo: true,
            tagline: None,
            contact_line: branch.phone,
            footer_note: None,
            show_customer_balance: true,
            show_item_discount: false,
            show_cashier_name: true,
            updated_at: now.to_rfc3339(),
        })
    }

    pub async fn update_receipt(
        database: &DatabaseConnection,
        query: &ReceiptSettingsQuery,
        fallback_branch: Uuid,
        request: &UpdateReceiptRequest,
    ) -> Result<ReceiptSettingsResponse, AppError> {
        let current = Self::get_receipt(database, query, fallback_branch).await?;
        let now = now_utc();
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE receipt_settings SET paper_width = ?, shop_name = ?, header_display = ?, show_logo = ?, tagline = ?, contact_line = ?, footer_note = ?, show_customer_balance = ?, show_item_discount = ?, show_cashier_name = ?, updated_at = ? WHERE id = ?",
                [
                    request
                        .paper_width
                        .clone()
                        .unwrap_or(current.paper_width)
                        .into(),
                    request
                        .shop_name
                        .clone()
                        .unwrap_or(current.shop_name)
                        .into(),
                    request
                        .header_display
                        .clone()
                        .unwrap_or(current.header_display)
                        .into(),
                    (request.show_logo.unwrap_or(current.show_logo) as i32).into(),
                    request
                        .tagline
                        .clone()
                        .or(current.tagline)
                        .into(),
                    request
                        .contact_line
                        .clone()
                        .or(current.contact_line)
                        .into(),
                    request
                        .footer_note
                        .clone()
                        .or(current.footer_note)
                        .into(),
                    (request
                        .show_customer_balance
                        .unwrap_or(current.show_customer_balance) as i32)
                        .into(),
                    (request
                        .show_item_discount
                        .unwrap_or(current.show_item_discount) as i32)
                        .into(),
                    (request
                        .show_cashier_name
                        .unwrap_or(current.show_cashier_name) as i32)
                        .into(),
                    now.into(),
                    parse_uuid(&current.id, "id")?.into(),
                ],
            ))
            .await?;
        Self::get_receipt(database, query, fallback_branch).await
    }

    pub async fn get_profile(
        database: &DatabaseConnection,
        branch_id: Uuid,
    ) -> Result<ProfileSettingsResponse, AppError> {
        let receipt = Self::get_receipt(
            database,
            &ReceiptSettingsQuery {
                branch_id: Some(branch_id.to_string()),
            },
            branch_id,
        )
        .await?;
        let branch = BranchRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, name, phone FROM branches WHERE id = ? LIMIT 1",
            [branch_id.into()],
        ))
        .one(database)
        .await?
        .ok_or(AppError::NotFound(
            crate::backend::constants::ERROR_BRANCH_NOT_FOUND,
        ))?;
        Ok(ProfileSettingsResponse {
            shop_name: receipt.shop_name,
            branch_id: branch.id.to_string(),
            branch_name: branch.name,
            branch_phone: branch.phone,
        })
    }

    pub async fn update_profile(
        database: &DatabaseConnection,
        branch_id: Uuid,
        request: &UpdateProfileRequest,
    ) -> Result<ProfileSettingsResponse, AppError> {
        let now = now_utc();
        if request.branch_name.is_some() || request.branch_phone.is_some() {
            let current = Self::get_profile(database, branch_id).await?;
            database
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE branches SET name = ?, phone = ?, updated_at = ? WHERE id = ?",
                    [
                        request
                            .branch_name
                            .clone()
                            .unwrap_or(current.branch_name)
                            .into(),
                        request
                            .branch_phone
                            .clone()
                            .or(current.branch_phone)
                            .into(),
                        now.into(),
                        branch_id.into(),
                    ],
                ))
                .await?;
        }
        if let Some(shop_name) = trimmed(&request.shop_name) {
            let _ = Self::update_receipt(
                database,
                &ReceiptSettingsQuery {
                    branch_id: Some(branch_id.to_string()),
                },
                branch_id,
                &UpdateReceiptRequest {
                    paper_width: None,
                    shop_name: Some(shop_name),
                    header_display: None,
                    show_logo: None,
                    tagline: None,
                    contact_line: None,
                    footer_note: None,
                    show_customer_balance: None,
                    show_item_discount: None,
                    show_cashier_name: None,
                },
            )
            .await?;
        }
        Self::get_profile(database, branch_id).await
    }
}

async fn load_receipt(
    database: &impl ConnectionTrait,
    branch_id: Uuid,
) -> Result<Option<ReceiptRow>, AppError> {
    Ok(ReceiptRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, branch_id, paper_width, shop_name, header_display, show_logo, tagline, contact_line, footer_note, show_customer_balance, show_item_discount, show_cashier_name, updated_at FROM receipt_settings WHERE branch_id = ? LIMIT 1",
        [branch_id.into()],
    ))
    .one(database)
    .await?)
}

fn map_localization(row: LocalizationRow) -> LocalizationSettingsResponse {
    LocalizationSettingsResponse {
        id: row.id.to_string(),
        currency_symbol: row.currency_symbol,
        currency_code: row.currency_code,
        language: row.language,
        expiry_reminder_days: row.expiry_reminder_days,
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn map_receipt(row: ReceiptRow) -> ReceiptSettingsResponse {
    ReceiptSettingsResponse {
        id: row.id.to_string(),
        branch_id: row.branch_id.to_string(),
        paper_width: row.paper_width,
        shop_name: row.shop_name,
        header_display: row.header_display,
        show_logo: row.show_logo != 0,
        tagline: row.tagline,
        contact_line: row.contact_line,
        footer_note: row.footer_note,
        show_customer_balance: row.show_customer_balance != 0,
        show_item_discount: row.show_item_discount != 0,
        show_cashier_name: row.show_cashier_name != 0,
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
