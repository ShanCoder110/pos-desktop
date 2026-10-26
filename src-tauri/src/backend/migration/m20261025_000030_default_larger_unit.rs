use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        connection
            .execute_unprepared(
                "CREATE TABLE product_unit_direction_20261025 (
                    unit_id BLOB PRIMARY KEY
                )",
            )
            .await?;
        // The earlier direction migration covered length units but missed Piece
        // rows inside a Pack. A Piece is 1/N Pack, never N Packs.
        connection
            .execute_unprepared(
                "INSERT INTO product_unit_direction_20261025 (unit_id)
                 SELECT piece.id FROM product_units piece
                 JOIN product_units stock ON stock.product_id = piece.product_id
                   AND stock.is_base = 1 AND stock.deleted_at IS NULL
                 WHERE piece.deleted_at IS NULL
                   AND piece.is_base = 0
                   AND piece.conversion_to_base > 1
                   AND piece.factor_direction = 'multiply'
                   AND lower(piece.display_name) IN ('piece', 'pieces', 'pc', 'pcs')
                   AND lower(stock.display_name) IN ('pack', 'box', 'carton')",
            )
            .await?;
        connection
            .execute_unprepared(
                "UPDATE product_units SET factor_direction = 'divide'
                 WHERE id IN (SELECT unit_id FROM product_unit_direction_20261025)",
            )
            .await?;
        connection
            .execute_unprepared(
                "CREATE TABLE product_unit_default_20261025 (
                    product_id BLOB PRIMARY KEY,
                    previous_unit_id BLOB NOT NULL,
                    larger_unit_id BLOB NOT NULL
                )",
            )
            .await?;
        // Older products marked the inventory Piece as default even after a Pack
        // was added. Change only that inherited default; preserve explicit defaults
        // on non-inventory units and every quantity, cost, and lot.
        connection
            .execute_unprepared(
                "INSERT INTO product_unit_default_20261025
                    (product_id, previous_unit_id, larger_unit_id)
                 SELECT base.product_id, base.id,
                    (SELECT larger.id FROM product_units larger
                     WHERE larger.product_id = base.product_id
                       AND larger.deleted_at IS NULL
                       AND larger.conversion_to_base > 0
                       AND (CASE WHEN larger.factor_direction = 'divide'
                                 THEN 1.0 / larger.conversion_to_base
                                 ELSE larger.conversion_to_base END) > 1
                     ORDER BY (CASE WHEN larger.factor_direction = 'divide'
                                    THEN 1.0 / larger.conversion_to_base
                                    ELSE larger.conversion_to_base END) DESC,
                              larger.sort_order ASC, larger.id ASC
                     LIMIT 1)
                 FROM product_units base
                 WHERE base.deleted_at IS NULL
                   AND base.is_base = 1
                   AND base.is_default_sale_unit = 1
                   AND EXISTS (
                     SELECT 1 FROM product_units larger
                     WHERE larger.product_id = base.product_id
                       AND larger.deleted_at IS NULL
                       AND larger.conversion_to_base > 0
                       AND (CASE WHEN larger.factor_direction = 'divide'
                                 THEN 1.0 / larger.conversion_to_base
                                 ELSE larger.conversion_to_base END) > 1
                   )",
            )
            .await?;
        connection
            .execute_unprepared(
                "UPDATE product_units SET is_default_sale_unit = 0
                 WHERE id IN (SELECT previous_unit_id FROM product_unit_default_20261025)",
            )
            .await?;
        connection
            .execute_unprepared(
                "UPDATE product_units SET is_default_sale_unit = 1
                 WHERE id IN (SELECT larger_unit_id FROM product_unit_default_20261025)",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        connection
            .execute_unprepared(
                "UPDATE product_units SET is_default_sale_unit = 0
                 WHERE product_id IN (SELECT product_id FROM product_unit_default_20261025)
                   AND is_default_sale_unit = 1",
            )
            .await?;
        connection
            .execute_unprepared(
                "UPDATE product_units SET is_default_sale_unit = 1
                 WHERE id IN (SELECT previous_unit_id FROM product_unit_default_20261025)",
            )
            .await?;
        connection
            .execute_unprepared("DROP TABLE product_unit_default_20261025")
            .await?;
        connection
            .execute_unprepared(
                "UPDATE product_units SET factor_direction = 'multiply'
                 WHERE id IN (SELECT unit_id FROM product_unit_direction_20261025)",
            )
            .await?;
        connection
            .execute_unprepared("DROP TABLE product_unit_direction_20261025")
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectOptions, ConnectionTrait, Database, DbBackend, Statement};
    use sea_orm_migration::{MigrationTrait, SchemaManager};

    use super::Migration;

    #[tokio::test]
    async fn promotes_only_a_smaller_inherited_default() {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1);
        let database = Database::connect(options).await.expect("memory db");
        database
            .execute_unprepared(
                "CREATE TABLE product_units (
                    id TEXT PRIMARY KEY, product_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    deleted_at TEXT, is_base INTEGER NOT NULL,
                    is_default_sale_unit INTEGER NOT NULL,
                    conversion_to_base REAL NOT NULL,
                    factor_direction TEXT NOT NULL, sort_order INTEGER NOT NULL,
                    cost_reference REAL NOT NULL
                )",
            )
            .await
            .expect("unit table");
        database
            .execute_unprepared(
                "CREATE UNIQUE INDEX one_default ON product_units(product_id)
                 WHERE is_default_sale_unit = 1 AND deleted_at IS NULL",
            )
            .await
            .expect("default constraint");
        for sql in [
            "INSERT INTO product_units VALUES ('piece-1', 'p1', 'Piece', NULL, 1, 1, 1, 'multiply', 0, 8.08)",
            "INSERT INTO product_units VALUES ('pack-1', 'p1', 'Pack', NULL, 0, 0, 24, 'multiply', 1, 194)",
            "INSERT INTO product_units VALUES ('pack-2', 'p2', 'Pack', NULL, 1, 1, 1, 'multiply', 0, 194)",
            "INSERT INTO product_units VALUES ('piece-2', 'p2', 'Piece', NULL, 0, 0, 24, 'divide', 1, 8.08)",
            "INSERT INTO product_units VALUES ('pack-3', 'p3', 'Pack', NULL, 1, 1, 1, 'multiply', 0, 670)",
            "INSERT INTO product_units VALUES ('piece-3', 'p3', 'Piece', NULL, 0, 0, 12, 'multiply', 1, 75)",
        ] {
            database.execute_unprepared(sql).await.expect("seed unit");
        }

        let manager = SchemaManager::new(&database);
        Migration.up(&manager).await.expect("promote default");
        let row = database
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, cost_reference FROM product_units
                 WHERE product_id = 'p1' AND is_default_sale_unit = 1"
                    .to_owned(),
            ))
            .await
            .expect("read default")
            .expect("default exists");
        let id: String = row.try_get("", "id").expect("id");
        let cost: f64 = row.try_get("", "cost_reference").expect("cost");
        assert_eq!(id, "pack-1");
        assert_eq!(cost, 194.0);
        let row = database
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT factor_direction FROM product_units WHERE id = 'piece-3'".to_owned(),
            ))
            .await
            .expect("read direction")
            .expect("piece exists");
        let direction: String = row.try_get("", "factor_direction").expect("direction");
        assert_eq!(direction, "divide");

        Migration.down(&manager).await.expect("restore default");
        let row = database
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id FROM product_units
                 WHERE product_id = 'p1' AND is_default_sale_unit = 1"
                    .to_owned(),
            ))
            .await
            .expect("read restored default")
            .expect("default exists");
        let id: String = row.try_get("", "id").expect("id");
        assert_eq!(id, "piece-1");
        let row = database
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT factor_direction FROM product_units WHERE id = 'piece-3'".to_owned(),
            ))
            .await
            .expect("read restored direction")
            .expect("piece exists");
        let direction: String = row.try_get("", "factor_direction").expect("direction");
        assert_eq!(direction, "multiply");
    }
}
