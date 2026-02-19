import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { log } from './logger.js';
import { loadConfig } from './config.js';
import { fetchAllJobs } from './fetcher.js';
import { matchJobs } from './matcher.js';
import { sendMatchEmail } from './emailer.js';
import type { RunStatus } from './types.js';

async function main(): Promise<void> {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isValidate = args.includes('--validate');
  const isDryRun = args.includes('--dry-run');

  // 1. Load and validate config
  const config = loadConfig('./config.yaml');

  if (isValidate) {
    log.info('Config valid');
    return;
  }

  log.info(`Starting Career Coach pipeline${isDryRun ? ' (dry-run mode)' : ''}`);
  log.info(`User: ${config.user.name}, Skills: ${config.preferences.skills.join(', ')}`);

  // 2. Fetch jobs from all sources
  const jobs = await fetchAllJobs();

  // 3. Match and score
  const matches = matchJobs(jobs, config);

  // 4. Send email (skip in dry-run)
  const emailSent = await sendMatchEmail(matches, config, isDryRun);

  // 5. Write run status
  const status: RunStatus = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    jobsFetched: jobs.length,
    sourceResults: {},
    userResults: [{
      user: config.user.name,
      success: true,
      matchCount: matches.length,
      emailSent,
    }],
    pipelineSuccess: true,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync('data/last_run_status.json', JSON.stringify(status, null, 2));
  log.info('Pipeline complete — status written to data/last_run_status.json');
}

function writeErrorStatus(error: string, startTime: number): void {
  const status: RunStatus = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    jobsFetched: 0,
    sourceResults: {},
    userResults: [{
      user: 'unknown',
      success: false,
      matchCount: 0,
      emailSent: false,
      error,
    }],
    pipelineSuccess: false,
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
