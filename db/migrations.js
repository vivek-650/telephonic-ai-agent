// Versioned schema. Never edit a migration that has shipped: add a new one.
// Versions 1-2 are written to be safe on databases created before migrations
// existed (CREATE IF NOT EXISTS, add-column-if-missing), so old installs upgrade in place.
import { migrate as suiteSchema } from '../suite.js';

const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
const addColumn = (db, t, c, def) => { if (!cols(db, t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

export const MIGRATIONS = [
  {
    version: 1, name: 'core tables',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, title TEXT, company TEXT, location TEXT,
        min_years REAL, max_salary REAL, locations TEXT, must_skills TEXT, max_notice_days REAL,
        description TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY, job_id TEXT, name TEXT, email TEXT, phone TEXT, city TEXT,
        years REAL, notice_days REAL, expected_salary REAL, skills TEXT, why TEXT,
        stage TEXT DEFAULT 'applied', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS screenings (
        id TEXT PRIMARY KEY, candidate_id TEXT, mode TEXT, status TEXT, run_id TEXT,
        transcript TEXT, answers TEXT, raw TEXT, started_at TEXT DEFAULT (datetime('now')), ended_at TEXT);
      CREATE TABLE IF NOT EXISTS scores (
        candidate_id TEXT PRIMARY KEY, total REAL, verdict TEXT, breakdown TEXT, flags TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY, candidate_id TEXT, helpful INTEGER, note TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS recruiters (id TEXT PRIMARY KEY, name TEXT, role TEXT);
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY, candidate_id TEXT, recruiter_id TEXT, kind TEXT, text TEXT, rating REAL, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id TEXT, kind TEXT, detail TEXT, at TEXT DEFAULT (datetime('now')));
    `),
  },
  { version: 2, name: 'recruiting suite: roles, voice agents, tasks, interviews, offers', up: db => suiteSchema(db) },
  {
    version: 3, name: 'indexes for the hot queries',
    up: db => db.exec(`
      CREATE INDEX IF NOT EXISTS idx_candidates_job ON candidates(job_id);
      CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(stage);
      CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(phone);
      CREATE INDEX IF NOT EXISTS idx_screenings_candidate ON screenings(candidate_id, status, started_at);
      CREATE INDEX IF NOT EXISTS idx_screenings_run ON screenings(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_candidate ON events(candidate_id, id);
      CREATE INDEX IF NOT EXISTS idx_activities_candidate ON activities(candidate_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_activities_recruiter ON activities(recruiter_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_candidate ON feedback(candidate_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, run_at);
    `),
  },
  {
    // Dograh retries webhooks; the delivery key makes a retry a no-op instead of a second scoring.
    version: 4, name: 'webhook idempotency',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        key TEXT PRIMARY KEY, candidate_id TEXT, outcome TEXT, received_at TEXT DEFAULT (datetime('now')));
    `),
  },
  {
    // Every automated score is recorded with the rubric version and a hash of its inputs, so any
    // AI hiring decision can be explained and reproduced later (audit trail for automated decisions).
    version: 5, name: 'score audit trail',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS score_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id TEXT NOT NULL, rubric_version TEXT NOT NULL,
        total REAL, verdict TEXT, inputs_hash TEXT, breakdown TEXT, trigger TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_score_audit_candidate ON score_audit(candidate_id, id);
    `),
  },
  {
    version: 6, name: 'screening timing and failure reason',
    up: db => { addColumn(db, 'screenings', 'duration_sec', 'INTEGER'); addColumn(db, 'screenings', 'failure_reason', 'TEXT'); },
  },
];
