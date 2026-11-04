// SQLite access: connection tuning, versioned migrations and transactions.
import { DatabaseSync } from 'node:sqlite';

/** Open the database tuned for a web server: WAL for concurrent reads, a busy timeout instead of SQLITE_BUSY errors. */
export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;');
  return db;
}

/**
 * Apply migrations in order, each exactly once, each in its own transaction.
 * A migration is `{ version, name, up(db) }`. Versions must be unique and increasing.
 * @returns {number[]} the versions applied by this call
 */
export function runMigrations(db, migrations) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT DEFAULT (datetime('now')))`);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const applied = [];
  let prev = 0;
  for (const m of migrations) {
    if (m.version <= prev) throw new Error(`migration ${m.version} (${m.name}) is out of order`);
    prev = m.version;
    if (done.has(m.version)) continue;
    transaction(db, () => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });
    applied.push(m.version);
  }
  return applied;
}

/** Run `fn` inside BEGIN/COMMIT; roll back on any error. Nested calls join the outer transaction. */
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Parse a JSON column, returning `fallback` for null or malformed values. */
export const json = (s, fallback = null) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
