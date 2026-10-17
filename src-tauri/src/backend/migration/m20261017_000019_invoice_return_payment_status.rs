use sea_orm_migration::prelude::*;

/// Allow invoice payment_status RETURNED / PARTIALLY_RETURNED after credit returns.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    /// Must not run inside a transaction: SQLite ignores PRAGMA foreign_keys
    /// changes while a transaction is open, and we need FK off to rebuild.
    fn use_transaction(&self) -> bool {
        false
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
        // Avoid SQLite rewriting child FK names during rename (post-3.26 behavior).
        conn.execute_unprepared("PRAGMA legacy_alter_table = ON")
            .await?;
        execute_script(
            manager,
            include_str!("m20261017_000019_invoice_return_payment_status.sql"),
        )
        .await?;
        conn.execute_unprepared("PRAGMA legacy_alter_table = OFF")
            .await?;
        conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
        conn.execute_unprepared("PRAGMA legacy_alter_table = ON")
            .await?;
        execute_script(
            manager,
            include_str!("m20261017_000019_invoice_return_payment_status.down.sql"),
        )
        .await?;
        conn.execute_unprepared("PRAGMA legacy_alter_table = OFF")
            .await?;
        conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
        Ok(())
    }
}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        // PRAGMA lines are handled in Rust around the rebuild.
        .filter(|value| !value.to_uppercase().starts_with("PRAGMA "))
    {
        manager
            .get_connection()
            .execute_unprepared(statement)
            .await?;
    }
    Ok(())
}
