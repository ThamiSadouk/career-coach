import { createHash } from 'node:crypto';
import { z } from 'zod';
import { log } from './logger.js';
import type { Job } from './types.js';

const REMOTEOK_URL = 'https://remoteok.com/api';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const FETCH_TIMEOUT_MS = 30_000;

const RemoteOKJobSchema = z.object({
  id: z.string(),
  position: z.string().min(1),
  company: z.string().min(1),
  url: z.string().url(),
  salary_min: z.number().optional().default(0),
  salary_max: z.number().optional().default(0),
  location: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  date: z.string(),
});

type RemoteOKJob = z.infer<typeof RemoteOKJobSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateJobId(title: string, company: string): string {
  const input = `${title}${company}`.toLowerCase();
  return createHash('sha256').update(input).digest('hex');
}

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'career-coach/1.0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return response;
      log.warn(`${url} returned ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`${url} fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${message}`);
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  log.warn(`${url} all ${MAX_RETRIES + 1} attempts failed — returning empty`);
  return null;
}

function normalizeRemoteOKJob(raw: RemoteOKJob): Job {
  const hasSalary = raw.salary_min > 0 || raw.salary_max > 0;
  return {
    id: generateJobId(raw.position, raw.company),
    title: raw.position,
    company: raw.company,
    url: raw.url,
    salary: {
      min: raw.salary_min,
      max: raw.salary_max,
      currency: hasSalary ? 'USD' : '',
      raw: hasSalary ? `$${raw.salary_min}-$${raw.salary_max}` : '',
    },
    location: raw.location || 'Remote',
    remote: true,
    skills: raw.tags.map((t) => t.toLowerCase()),
    postedAt: new Date(raw.date),
    source: 'remoteok',
  };
}

export async function fetchFromRemoteOK(): Promise<Job[]> {
  log.info('Fetching jobs from RemoteOK...');

  const response = await fetchWithRetry(REMOTEOK_URL);
  if (!response) return [];

  try {
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      log.warn('RemoteOK returned non-array response');
      return [];
    }

    // First element is metadata — skip it
    const rawJobs = data.slice(1);
    const jobs: Job[] = [];

    for (const item of rawJobs) {
      const result = RemoteOKJobSchema.safeParse(item);
      if (result.success) {
        jobs.push(normalizeRemoteOKJob(result.data));
      } else {
        log.warn(`Skipping invalid RemoteOK job: ${JSON.stringify(result.error.issues[0])}`);
      }
    }

    log.info(`RemoteOK: ${jobs.length} valid jobs (${rawJobs.length - jobs.length} skipped)`);
    return jobs;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`RemoteOK response parsing failed: ${message}`);
    return [];
  }
}

export async function fetchFromWeb3Career(): Promise<Job[]> {
  // Placeholder — will be implemented in Story 2.2
  return [];
}

export async function fetchAllJobs(): Promise<Job[]> {
  const [remoteOKJobs, web3Jobs] = await Promise.all([fetchFromRemoteOK(), fetchFromWeb3Career()]);

  const allJobs = [...remoteOKJobs, ...web3Jobs];
  log.info(`Total fetched: ${allJobs.length} jobs (RemoteOK: ${remoteOKJobs.length}, Web3: ${web3Jobs.length})`);

  return allJobs;
}
