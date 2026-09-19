pub mod config;
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

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use self::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Arc<Config>,
}
