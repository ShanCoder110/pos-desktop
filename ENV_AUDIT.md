# Environment & secrets — audit note (2026-09-19)

## Moved into env / `Config`

| Former hardcoded value | Now |
|---|---|
| `ACCESS_TOKEN_TTL_MINUTES = 60` | `ACCESS_TOKEN_EXPIRY` (e.g. `60m`) via `Config` |
| `REFRESH_TOKEN_TTL_DAYS = 30` | `REFRESH_TOKEN_EXPIRY` (e.g. `30d`) via `Config` |
| `SEED_OWNER_PASSWORD = "owner123"` | `SEED_OWNER_PASSWORD` in `.env` |
| `DEFAULT_STAFF_PASSWORD` / TS default | `DEFAULT_STAFF_PASSWORD` + `VITE_DEFAULT_STAFF_PASSWORD` |
| API bind host/port from `constants` at runtime | `API_HOST` / `API_PORT` via `Config` |
| Ad-hoc `DUKAN_DB_PATH` in bins | Required `DUKAN_DB_PATH` via `Config` |
| `SEED_AUTH.password` inline in TS | `VITE_SEED_OWNER_PASSWORD` |

## Left as non-secret constants

- Seed UUIDs (`SEED_*_ID`), route paths, `ERROR_*` strings, CORS allowlist
- Auth uses opaque random tokens hashed at rest — **no JWT signing secrets** today

## ⚠️ Git history — rotate

`owner123` was committed as `SEED_OWNER_PASSWORD` in `src-tauri/src/backend/constants.rs` (e.g. commit `ed80017` and later). Treat that value as **compromised** for anything beyond a disposable local DB: change the live password, update `.env`, and re-seed / re-hash if you keep a seed owner.

## Already decided in code

- Refresh tokens are **rotated on refresh** (`rotate_session_tokens`).
