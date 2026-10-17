import type { SqlDriver } from './sqlDriver';

// Versioned schema. Add a new entry to MIGRATIONS for every change; never edit a shipped one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS offline_queue (
    seq            INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id      TEXT NOT NULL UNIQUE,
    dedupe_key     TEXT NOT NULL UNIQUE,
    type           TEXT NOT NULL,
    queued_at      TEXT NOT NULL,
    base_version   INTEGER NOT NULL,
    payload_json   TEXT NOT NULL,
    summary        TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    status         TEXT NOT NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    resolution     TEXT,
    error_code     TEXT,
    server_version INTEGER,
    signature      TEXT,
    processed_order INTEGER,
    last_error     TEXT,
    resolved_at    TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
  `,
];

export async function migrate(db: SqlDriver): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);');
  const row = await db.first<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
  let current = row?.version ?? 0;
  if (!row) await db.run('INSERT INTO schema_version (version) VALUES (0)');
  while (current < MIGRATIONS.length) {
    await db.exec(MIGRATIONS[current]);
    current += 1;
    await db.run('UPDATE schema_version SET version = ?', [current]);
  }
}
