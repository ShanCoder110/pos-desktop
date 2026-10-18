use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("ALTER TABLE products ADD COLUMN product_no INTEGER")
            .await?;
        // Assign stable shop search IDs to existing rows (1..N by create order).
        conn.execute_unprepared(
            r#"
            WITH numbered AS (
              SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS n
              FROM products
              WHERE deleted_at IS NULL
            )
            UPDATE products
            SET product_no = (SELECT n FROM numbered WHERE numbered.id = products.id)
            WHERE deleted_at IS NULL
            "#,
        )
        .await?;
        conn.execute_unprepared(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_products_product_no ON products(product_no) WHERE deleted_at IS NULL AND product_no IS NOT NULL",
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("DROP INDEX IF EXISTS ux_products_product_no")
            .await?;
        conn.execute_unprepared("ALTER TABLE products DROP COLUMN product_no")
            .await?;
        Ok(())
    }
}
