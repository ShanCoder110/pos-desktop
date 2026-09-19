# Dukan POS data model

The canonical audited model specification is maintained in
[`docs/system-audit-and-data-model.md`](docs/system-audit-and-data-model.md).

The initial executable schema is implemented by the versioned SeaORM migration in
`src-tauri/src/backend/migration/initial.sql`, with its matching rollback in
`src-tauri/src/backend/migration/down.sql`.

Design constraints that must remain true:

- The local operational database represents one business.
- `business_id` belongs only to `users`; operational tables do not repeat a tenant key.
- Cloud PostgreSQL uses `public` for super admins, shop accounts, authentication, and schema provisioning; each shop gets one isolated operational schema.
- PostgreSQL shop schemas use the same logical model as local SQLite, with database-specific native types.
- No configurable timezone column is stored.
- Inventory and financial history are append-only; master records use soft deletion.
- Stock-changing workflows must run in backend transactions.
