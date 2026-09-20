CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cities_name ON cities(lower(name)) WHERE deleted_at IS NULL;

ALTER TABLE users ADD COLUMN city_id TEXT REFERENCES cities(id);
ALTER TABLE suppliers ADD COLUMN city_id TEXT REFERENCES cities(id);
ALTER TABLE customers ADD COLUMN city_id TEXT REFERENCES cities(id);
