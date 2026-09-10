//! CLI for local SQLite migrations and seed.
//!
//! Usage (from repo root or src-tauri):
//!   cargo run --bin db -- migrate [--db PATH]
//!   cargo run --bin db -- seed [--db PATH]
//!   cargo run --bin db -- status [--db PATH]
//!   cargo run --bin db -- new NAME
//!
//! Default DB path: ./data/dukan-pos.sqlite3 (or $DUKAN_DB_PATH).
//! Tauri app data DB is separate (app_data_dir); pass --db to that file to manage it.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use chrono::Utc;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use sea_orm_migration::MigratorTrait;

use tauri_app_lib::backend::{
    constants::DATABASE_FILE_NAME,
    db::{apply_runtime_pragmas, connect_path},
    migration::Migrator,
};

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .try_init()
        .ok();

    let mut args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_help();
        return ExitCode::FAILURE;
    }

    let command = args.remove(0);
    let db_path = take_db_flag(&mut args).unwrap_or_else(default_db_path);

    match command.as_str() {
        "help" | "-h" | "--help" => {
            print_help();
            ExitCode::SUCCESS
        }
        "migrate" | "up" => match migrate(&db_path).await {
            Ok(()) => {
                println!("Migrated {}", db_path.display());
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("migrate failed: {error}");
                ExitCode::FAILURE
            }
        },
        "seed" => match seed(&db_path).await {
            Ok(()) => {
                println!("Seed ensured on {}", db_path.display());
                println!("Login: owner / owner123");
                println!("Device id: 20000000-0000-4000-8000-000000000003");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("seed failed: {error}");
                ExitCode::FAILURE
            }
        },
        "status" => match status(&db_path).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("status failed: {error}");
                ExitCode::FAILURE
            }
        },
        "new" => {
            let name = args.first().map(String::as_str).unwrap_or("");
            if name.is_empty() {
                eprintln!("usage: db new <snake_case_name>");
                return ExitCode::FAILURE;
            }
            match create_migration(name) {
                Ok(path) => {
                    println!("Created {}", path.display());
                    println!("Register it in src/backend/migration/mod.rs");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("new migration failed: {error}");
                    ExitCode::FAILURE
                }
            }
        }
        other => {
            eprintln!("unknown command: {other}");
            print_help();
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    println!(
        "\
Dukan POS database CLI

Commands:
  migrate [--db PATH]   Apply pending SeaORM migrations (includes unit + shop seed)
  seed    [--db PATH]   Re-run shop seed SQL (INSERT OR IGNORE) after migrate
  status  [--db PATH]   Show applied migration versions and core row counts
  new NAME              Scaffold src/backend/migration/mYYYYMMDD_HHMMSS_NAME.rs + .sql

Options:
  --db PATH             SQLite file (default: ./data/{DATABASE_FILE_NAME} or $DUKAN_DB_PATH)

Examples:
  npm run db:migrate
  npm run db:seed
  npm run db:status
  npm run db:new -- add_receipt_fields
  cargo run --bin db -- migrate --db \"$HOME/Library/Application Support/com.dukan.pos/{DATABASE_FILE_NAME}\"
"
    );
}

fn default_db_path() -> PathBuf {
    if let Ok(path) = env::var("DUKAN_DB_PATH") {
        return PathBuf::from(path);
    }
    PathBuf::from("data").join(DATABASE_FILE_NAME)
}

fn take_db_flag(args: &mut Vec<String>) -> Option<PathBuf> {
    if let Some(index) = args.iter().position(|arg| arg == "--db") {
        let path = args.get(index + 1).cloned();
        args.drain(index..=index + 1.min(args.len().saturating_sub(index + 1)));
        return path.map(PathBuf::from);
    }
    None
}

async fn migrate(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _db = connect_path(path.clone()).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn seed(path: &PathBuf) -> Result<(), String> {
    let db = connect_path(path.clone()).await.map_err(|e| e.to_string())?;
    // Shop seed is also a migration; re-apply SQL with INSERT OR IGNORE for idempotent refresh.
    run_sql_script(&db, include_str!("../backend/migration/seed_shop.sql")).await?;
    run_sql_script(&db, include_str!("../backend/migration/seed_units.sql")).await?;
    apply_runtime_pragmas(&db).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn status(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        println!("Database not found: {}", path.display());
        return Ok(());
    }
    let db = connect_path(path.clone()).await.map_err(|e| e.to_string())?;
    println!("Database: {}", path.display());
    let applied = Migrator::get_applied_migrations(&db)
        .await
        .map_err(|e| e.to_string())?;
    println!("Applied migrations: {}", applied.len());
    for item in &applied {
        println!("  - {}", item.name());
    }
    for (label, sql) in [
        ("units", "SELECT COUNT(*) AS c FROM units"),
        ("users", "SELECT COUNT(*) AS c FROM users"),
        ("branches", "SELECT COUNT(*) AS c FROM branches"),
        ("products", "SELECT COUNT(*) AS c FROM products"),
        ("product_lots", "SELECT COUNT(*) AS c FROM product_lots"),
        ("invoices", "SELECT COUNT(*) AS c FROM invoices"),
    ] {
        let count = count_rows(&db, sql).await.unwrap_or(-1);
        println!("{label}: {count}");
    }
    Ok(())
}

async fn count_rows(db: &DatabaseConnection, sql: &str) -> Result<i64, String> {
    let row = db
        .query_one_raw(Statement::from_string(DbBackend::Sqlite, sql.to_owned()))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "missing count row".to_owned())?;
    row.try_get::<i64>("", "c").map_err(|e| e.to_string())
}

async fn run_sql_script(db: &DatabaseConnection, script: &str) -> Result<(), String> {
    for statement in script.split(';') {
        let statement = statement
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        if statement.is_empty() {
            continue;
        }
        db.execute_unprepared(&statement)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn create_migration(name: &str) -> Result<PathBuf, String> {
    let slug = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_owned();
    if slug.is_empty() {
        return Err("invalid migration name".into());
    }
    let stamp = Utc::now().format("%Y%m%d_%H%M%S");
    let stem = format!("m{stamp}_{slug}");
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/backend/migration");
    let rs_path = dir.join(format!("{stem}.rs"));
    let sql_path = dir.join(format!("{stem}.sql"));
    let down_path = dir.join(format!("{stem}.down.sql"));
    if rs_path.exists() {
        return Err(format!("already exists: {}", rs_path.display()));
    }
    fs::write(
        &sql_path,
        format!("-- Migration {stem}\n-- Write forward SQL here.\n"),
    )
    .map_err(|e| e.to_string())?;
    fs::write(
        &down_path,
        format!("-- Rollback for {stem}\n"),
    )
    .map_err(|e| e.to_string())?;
    fs::write(
        &rs_path,
        format!(
            r#"use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {{
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {{
        execute_script(manager, include_str!("{stem}.sql")).await
    }}

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {{
        execute_script(manager, include_str!("{stem}.down.sql")).await
    }}
}}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {{
    for statement in script.split(';') {{
        let statement = statement
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        if statement.is_empty() {{
            continue;
        }}
        manager
            .get_connection()
            .execute_unprepared(&statement)
            .await?;
    }}
    Ok(())
}}
"#
        ),
    )
    .map_err(|e| e.to_string())?;
    Ok(rs_path)
}
