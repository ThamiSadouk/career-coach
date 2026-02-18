import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { log } from '../logger.js';

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: executed } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name',
  );
  const executedSet = new Set(executed.map((r) => r.name));

  const migrationsDir = path.resolve(import.meta.dirname, '../../db/migrations');
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  for (const file of files) {
    if (executedSet.has(file)) continue;

    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    log.info(`Running migration: ${file}`);

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      log.info(`Migration applied: ${file}`);
    } catch (err) {
      try {
        await pool.query('ROLLBACK');
      } catch {
        // Connection may be lost — original error is more important
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Migration ${file} failed: ${message}`);
      throw err;
    }
  }

  log.info(`Migrations complete (${files.length} total, ${files.length - executedSet.size} applied)`);
}
