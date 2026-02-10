import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { log } from './logger.js';
import { loadConfig } from './config.js';
import type { Job, MatchResult, RunStatus } from './types.js';

async function main(): Promise<void> {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isValidate = args.includes('--validate');
  const isDryRun = args.includes('--dry-run');
  const errors: string[] = [];

  // 1. Load and validate config
  const config = loadConfig('./config.yaml');

  if (isValidate) {
    log.info('Config valid');
    return;
  }

  log.info(`Starting Career Coach pipeline${isDryRun ? ' (dry-run mode)' : ''}`);
  log.info(`User: ${config.user.name}, Skills: ${config.preferences.skills.join(', ')}`);

  // 2. Fetch jobs (placeholder)
  log.info('Fetching jobs...');
  const jobs: Job[] = [];
  log.info(`Fetched ${jobs.length} jobs`);

  // 3. Match and score (placeholder)
  log.info('Matching jobs...');
  const matches: MatchResult[] = [];
  log.info(`Found ${matches.length} matches`);

  // 4. Send email (skip in dry-run)
  let emailSent = false;
  if (isDryRun) {
    log.info('Dry-run mode — skipping email');
  } else {
    log.info('Sending email...');
    // placeholder — will be implemented in Epic 4
    log.info('Email placeholder complete');
  }

  // 5. Write run status
  const status: RunStatus = {
    timestamp: new Date().toISOString(),
    success: true,
    jobsFetched: jobs.length,
    jobsMatched: matches.length,
    emailSent,
    durationMs: Date.now() - startTime,
    errors,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync('data/last_run_status.json', JSON.stringify(status, null, 2));
  log.info('Pipeline complete — status written to data/last_run_status.json');
}

function writeErrorStatus(error: string, startTime: number): void {
  const status: RunStatus = {
    timestamp: new Date().toISOString(),
    success: false,
    jobsFetched: 0,
    jobsMatched: 0,
    emailSent: false,
    durationMs: Date.now() - startTime,
    errors: [error],
  };
  mkdirSync('data', { recursive: true });
  writeFileSync('data/last_run_status.json', JSON.stringify(status, null, 2));
}

const pipelineStart = Date.now();
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error(message);
  writeErrorStatus(message, pipelineStart);
  process.exitCode = 1;
});
