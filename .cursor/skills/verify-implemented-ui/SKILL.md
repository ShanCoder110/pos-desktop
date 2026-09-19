---
name: verify-implemented-ui
description: >-
  Requires proving a UI/API change works in the running app before marking
  the task done. Use whenever implementing or fixing pages, drawers, tables,
  login, products, categories, or any fetch that can abort (Strict Mode).
  Trigger on “it works”, “integrated”, flicker, empty lists, abort errors,
  or logout on refresh.
---

# Verify implemented UI

Do not report a frontend/backend change as done after compile or code inspection alone.

## Required proof

1. **API is up** — `npm run backend` logs `backend API listening`. If it crashed on migrate, fix that first.
2. **Same path the user takes** — open the app, sign in if needed, click the nav item. Hard reload is not the first check.
3. **First visit shows data** — products, categories, KPIs, empty state (if truly empty). A blank table that fills only after F5 is a bug.
4. **No abort fallout** — console must not spam `AbortError` as a user-facing failure. Session must survive Strict Mode remount (`ensureSession` must not use a page `AbortSignal` for `/auth/me`).
5. **Related tabs** — if you touched products hub, check All products **and** Categories (they share hub state).

## How to prove it

- Prefer browser tools: navigate, wait for the table, screenshot or snapshot.
- If no browser: `curl` login then `GET /products` and `GET /categories` with the token, **and** say you could not click the UI.
- Catch `AbortError` in loaders; never `clearTokens()` or toast load-failed on abort.

## Fail the task if

- Data appears only after hard reload.
- Opening the page logs the user out.
- You only ran `tsc` / `npm run build`.
