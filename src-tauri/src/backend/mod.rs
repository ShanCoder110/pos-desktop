pub mod constants;
pub mod context;
pub mod db;
pub mod dto;
pub mod entities;
pub mod errors;
pub mod extract;
pub mod handlers;
pub mod migration;
pub mod repositories;
pub mod security;
pub mod server;
pub mod services;
pub mod util;

use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
}
