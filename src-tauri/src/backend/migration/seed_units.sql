INSERT OR IGNORE INTO units
  (id, name, symbol, precision, is_active, version, created_at, updated_at)
VALUES
  (X'10000000000040008000000000000001', 'Piece', 'pc', 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000008', 'Pack', 'pk', 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000009', 'Box', 'box', 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000003', 'Gaz', 'gaz', 3, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000002', 'Meter', 'm', 3, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000005', 'Roll', 'roll', 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'10000000000040008000000000000004', 'Foot', 'ft', 3, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
