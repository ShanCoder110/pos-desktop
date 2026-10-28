use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;
use std::collections::BTreeSet;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        rebuild_price_modes(manager.get_connection(), true).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        rebuild_price_modes(manager.get_connection(), false).await
    }
}

async fn fk_violations(conn: &impl ConnectionTrait) -> Result<BTreeSet<String>, DbErr> {
    conn.query_all_raw(Statement::from_string(
        DbBackend::Sqlite,
        "PRAGMA foreign_key_check",
    ))
    .await?
    .into_iter()
    .map(|row| {
        Ok(format!(
            "{}|{}|{}|{}",
            row.try_get_by_index::<String>(0)?,
            row.try_get_by_index::<i64>(1)?,
            row.try_get_by_index::<String>(2)?,
            row.try_get_by_index::<i64>(3)?
        ))
    })
    .collect()
}

// Migrations use a single SQLite connection. Rebuild the CHECK constraint in a
// transaction with FKs temporarily off, preserving rows, indexes and children.
async fn rebuild_price_modes(conn: &impl ConnectionTrait, minimum: bool) -> Result<(), DbErr> {
    let schema = conn
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoice_items'",
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("invoice_items missing".into()))?;
    let schema: String = schema.try_get("", "sql")?;
    let old_modes = "('RETAIL','WHOLESALE')";
    let new_modes = "('RETAIL','WHOLESALE','MINIMUM')";
    let (from, to) = if minimum {
        (old_modes, new_modes)
    } else {
        (new_modes, old_modes)
    };
    if schema.contains(to) {
        return Ok(());
    }
    if !schema.contains(from) {
        return Err(DbErr::Custom(
            "Unknown invoice_items price_mode constraint".into(),
        ));
    }
    let create = schema
        .replacen("invoice_items", "invoice_items_minimum_rebuild", 1)
        .replace(from, to);
    let indexes = conn.query_all_raw(Statement::from_string(DbBackend::Sqlite,
        "SELECT sql FROM sqlite_master WHERE tbl_name = 'invoice_items' AND type IN ('index', 'trigger') AND sql IS NOT NULL"))
        .await?;
    let columns = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA table_info(invoice_items)",
        ))
        .await?
        .into_iter()
        .map(|row| {
            row.try_get::<String>("", "name")
                .map(|name| format!("\"{}\"", name.replace('"', "\"\"")))
        })
        .collect::<Result<Vec<_>, _>>()?
        .join(",");
    let before = fk_violations(conn).await?;
    conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
    let fk = conn
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA foreign_keys",
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("foreign_keys pragma missing".into()))?;
    if fk.try_get_by_index::<i64>(0)? != 0 {
        return Err(DbErr::Custom(
            "Minimum price migration needs a single connection outside a transaction".into(),
        ));
    }
    let result: Result<(), DbErr> = async {
        conn.execute_unprepared("BEGIN IMMEDIATE").await?;
        if !minimum {
            conn.execute_unprepared("UPDATE invoice_items SET price_mode = 'RETAIL' WHERE price_mode = 'MINIMUM'").await?;
        }
        conn.execute_unprepared(&create).await?;
        conn.execute_unprepared(&format!(
            "INSERT INTO invoice_items_minimum_rebuild (rowid,{columns}) SELECT rowid,{columns} FROM invoice_items"
        )).await?;
        conn.execute_unprepared("DROP TABLE invoice_items").await?;
        conn.execute_unprepared("ALTER TABLE invoice_items_minimum_rebuild RENAME TO invoice_items").await?;
        for row in indexes {
            conn.execute_unprepared(&row.try_get::<String>("", "sql")?).await?;
        }
        if fk_violations(conn).await?.difference(&before).next().is_some() {
            return Err(DbErr::Custom("Minimum price migration introduced a foreign key violation".into()));
        }
        conn.execute_unprepared("COMMIT").await?;
        Ok(())
    }.await;
    if result.is_err() {
        let _ = conn.execute_unprepared("ROLLBACK").await;
    }
    conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{ConnectOptions, Database};

    #[tokio::test]
    async fn minimum_mode_preserves_existing_prices_children_and_indexes() {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1);
        let db = Database::connect(options).await.unwrap();
        db.execute_unprepared("PRAGMA foreign_keys = ON;
            CREATE TABLE invoice_items (id TEXT PRIMARY KEY, unit_price REAL, price_mode TEXT CHECK (price_mode IN ('RETAIL','WHOLESALE')));
            CREATE INDEX item_mode_idx ON invoice_items(price_mode);
            CREATE TABLE item_children (id TEXT PRIMARY KEY, item_id TEXT REFERENCES invoice_items(id) ON DELETE CASCADE);
            INSERT INTO invoice_items VALUES ('old', 25, 'RETAIL');
            INSERT INTO item_children VALUES ('child', 'old');").await.unwrap();
        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await.unwrap();
        Migration.up(&manager).await.unwrap();
        db.execute_unprepared("INSERT INTO invoice_items VALUES ('minimum', 12, 'MINIMUM')")
            .await
            .unwrap();
        assert!(db
            .execute_unprepared("INSERT INTO invoice_items VALUES ('invalid', 1, 'UNKNOWN')")
            .await
            .is_err());
        let row = db.query_one_raw(Statement::from_string(DbBackend::Sqlite,
            "SELECT i.unit_price, (SELECT COUNT(*) FROM item_children) AS children, (SELECT COUNT(*) FROM sqlite_master WHERE name='item_mode_idx') AS indexes FROM invoice_items i WHERE id='old'"))
            .await.unwrap().unwrap();
        assert_eq!(row.try_get::<f64>("", "unit_price").unwrap(), 25.0);
        assert_eq!(row.try_get::<i64>("", "children").unwrap(), 1);
        assert_eq!(row.try_get::<i64>("", "indexes").unwrap(), 1);
        assert!(fk_violations(&db).await.unwrap().is_empty());
        Migration.down(&manager).await.unwrap();
        let row = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT unit_price, price_mode FROM invoice_items WHERE id='minimum'",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<f64>("", "unit_price").unwrap(), 12.0);
        assert_eq!(row.try_get::<String>("", "price_mode").unwrap(), "RETAIL");
        assert!(fk_violations(&db).await.unwrap().is_empty());
    }
}
