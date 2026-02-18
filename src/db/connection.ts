import pg from 'pg';
import { log } from '../logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log.error('DATABASE_URL environment variable is not set');
    return null;
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  pool.on('error', (err: Error) => {
    log.error(`Unexpected error on idle database client: ${err.message}`);
  });

  return pool;
}

export async function disconnect(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info('Database pool disconnected');
  }
}
