use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

const CREATE_PURCHASE_ORDER_ITEMS: &str = "
CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_id TEXT NOT NULL REFERENCES product_units(id),
  unit_name_snapshot TEXT NOT NULL,
  ordered_quantity REAL NOT NULL CHECK (ordered_quantity > 0),
  ordered_base_quantity REAL NOT NULL CHECK (ordered_base_quantity > 0),
  expected_unit_cost REAL NOT NULL CHECK (expected_unit_cost >= 0),
  received_base_quantity REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)";

const CREATE_GOODS_RECEIPTS: &str = "
CREATE TABLE goods_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  receipt_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT,
  received_date TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  received_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)";

const CREATE_SUPPLIER_LEDGER: &str = "
CREATE TABLE supplier_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  goods_receipt_id TEXT REFERENCES goods_receipts(id),
  money_transaction_id TEXT REFERENCES money_transactions(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
)";

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        connection
            .execute_unprepared("PRAGMA foreign_keys = OFF")
            .await?;

        if table_references_legacy(connection, "purchase_order_items", "purchase_orders_legacy")
            .await?
        {
            repair_purchase_order_items(connection).await?;
        }

        if table_references_legacy(connection, "goods_receipts", "purchase_orders_legacy").await? {
            repair_goods_receipts(connection).await?;
        }

        if supplier_ledger_needs_repair(connection).await? {
            repair_supplier_ledger(connection).await?;
        }

        cleanup_orphan_legacy(connection).await?;

        connection
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

async fn supplier_ledger_needs_repair(connection: &impl ConnectionTrait) -> Result<bool, DbErr> {
    for legacy in ["purchase_orders_legacy", "goods_receipts_legacy"] {
        if table_references_legacy(connection, "supplier_ledger_entries", legacy).await? {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn table_references_legacy(
    connection: &impl ConnectionTrait,
    table: &str,
    legacy: &str,
) -> Result<bool, DbErr> {
    if !table_exists(connection, table).await? {
        return Ok(false);
    }
    let rows = connection
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            format!("PRAGMA foreign_key_list({table})"),
        ))
        .await?;
    for row in rows {
        let referenced_table = row.try_get::<String>("", "table")?;
        if referenced_table == legacy {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn table_exists(connection: &impl ConnectionTrait, table: &str) -> Result<bool, DbErr> {
    let row = connection
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            [table.into()],
        ))
        .await?;
    Ok(row.is_some())
}

async fn repair_purchase_order_items(connection: &impl ConnectionTrait) -> Result<(), DbErr> {
    if table_exists(connection, "purchase_order_items_legacy").await? {
        return Ok(());
    }
    connection
        .execute_unprepared(
            "ALTER TABLE purchase_order_items RENAME TO purchase_order_items_legacy",
        )
        .await?;
    connection
        .execute_unprepared(CREATE_PURCHASE_ORDER_ITEMS)
        .await?;
    connection
        .execute_unprepared(
            "INSERT INTO purchase_order_items SELECT * FROM purchase_order_items_legacy",
        )
        .await?;
    connection
        .execute_unprepared("DROP TABLE purchase_order_items_legacy")
        .await?;
    connection
        .execute_unprepared(
            "CREATE INDEX IF NOT EXISTS ix_purchase_order_items_product ON purchase_order_items(product_id)",
        )
        .await?;
    Ok(())
}

async fn repair_goods_receipts(connection: &impl ConnectionTrait) -> Result<(), DbErr> {
    if table_exists(connection, "goods_receipts_legacy").await? {
        connection
            .execute_unprepared("DROP TABLE goods_receipts_legacy")
            .await?;
    }
    if !table_references_legacy(connection, "goods_receipts", "purchase_orders_legacy").await? {
        return Ok(());
    }
    connection
        .execute_unprepared("ALTER TABLE goods_receipts RENAME TO goods_receipts_legacy")
        .await?;
    connection.execute_unprepared(CREATE_GOODS_RECEIPTS).await?;
    connection
        .execute_unprepared("INSERT INTO goods_receipts SELECT * FROM goods_receipts_legacy")
        .await?;
    connection
        .execute_unprepared("DROP TABLE goods_receipts_legacy")
        .await?;
    Ok(())
}

async fn repair_supplier_ledger(connection: &impl ConnectionTrait) -> Result<(), DbErr> {
    if table_exists(connection, "supplier_ledger_entries_legacy").await? {
        return Ok(());
    }
    connection
        .execute_unprepared(
            "ALTER TABLE supplier_ledger_entries RENAME TO supplier_ledger_entries_legacy",
        )
        .await?;
    connection
        .execute_unprepared(CREATE_SUPPLIER_LEDGER)
        .await?;
    connection
        .execute_unprepared(
            "INSERT INTO supplier_ledger_entries SELECT * FROM supplier_ledger_entries_legacy",
        )
        .await?;
    connection
        .execute_unprepared("DROP TABLE supplier_ledger_entries_legacy")
        .await?;
    Ok(())
}

async fn cleanup_orphan_legacy(connection: &impl ConnectionTrait) -> Result<(), DbErr> {
    if table_exists(connection, "goods_receipts").await?
        && table_exists(connection, "goods_receipts_legacy").await?
    {
        connection
            .execute_unprepared("DROP TABLE goods_receipts_legacy")
            .await?;
    }
    if table_exists(connection, "purchase_order_items").await?
        && table_exists(connection, "purchase_order_items_legacy").await?
    {
        connection
            .execute_unprepared("DROP TABLE purchase_order_items_legacy")
            .await?;
    }
    Ok(())
}
