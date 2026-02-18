import type pg from 'pg';
import { log } from '../logger.js';
import { UserProfileSchema, type UserProfile, type CreateUserInput } from '../types.js';

function mapRowToProfile(row: Record<string, unknown>): unknown {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    skills: row.skills,
    location: row.location ?? null,
    salaryMinimum: row.salary_minimum != null ? Number(row.salary_minimum) : null,
    salaryPeriod: row.salary_period,
    jobTypePreference: row.job_type_preference,
    remotePreference: row.remote_preference,
    includeUnknowns: row.include_unknowns,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUser(
  pool: pg.Pool,
  input: CreateUserInput,
): Promise<UserProfile | null> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, skills, location, salary_minimum, salary_period, job_type_preference, remote_preference, include_unknowns)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.name,
        input.email,
        input.skills,
        input.location,
        input.salaryMinimum,
        input.salaryPeriod,
        input.jobTypePreference,
        input.remotePreference,
        input.includeUnknowns,
      ],
    );

    const mapped = mapRowToProfile(rows[0] as Record<string, unknown>);
    const profile = UserProfileSchema.parse(mapped);
    log.info(`User created: ${profile.name}`);
    return profile;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Failed to create user: ${message}`);
    return null;
  }
}

export async function getActiveUsers(pool: pg.Pool): Promise<UserProfile[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE active = true');

    if (rows.length === 0) {
      log.warn('No active users found in database');
      return [];
    }

    const profiles: UserProfile[] = [];
    for (const row of rows) {
      const mapped = mapRowToProfile(row as Record<string, unknown>);
      const result = UserProfileSchema.safeParse(mapped);
      if (result.success) {
        profiles.push(result.data);
      } else {
        const name = typeof (row as Record<string, unknown>).name === 'string'
          ? (row as Record<string, unknown>).name
          : 'unknown';
        log.warn(`Skipping invalid user profile: ${name} — ${result.error.issues[0]?.message}`);
      }
    }

    log.info(`Loaded ${profiles.length} active user(s)`);
    return profiles;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Failed to load active users: ${message}`);
    return [];
  }
}
