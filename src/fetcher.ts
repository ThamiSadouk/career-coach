import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { log } from './logger.js';
import type { Job } from './types.js';

function timestampStamp(): string {
  const parts = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
  return parts.replace(/:/g, '-').replace(' ', 'T');
}

function saveRawData(source: string, data: unknown[]): void {
  mkdirSync('data', { recursive: true });
  const path = `data/${source}-${timestampStamp()}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
  log.info(`Raw data saved to ${path}`);
}

const REMOTEOK_URL = 'https://remoteok.com/api';
const WEB3CAREER_BASE_URL = 'https://web3.career/api/v1';
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
    const rawParsed: RemoteOKJob[] = [];

    for (const item of rawJobs) {
      const result = RemoteOKJobSchema.safeParse(item);
      if (result.success) {
        rawParsed.push(result.data);
        jobs.push(normalizeRemoteOKJob(result.data));
      } else {
        log.warn(`Skipping invalid RemoteOK job: ${JSON.stringify(result.error.issues[0])}`);
      }
    }

    log.info(`RemoteOK: ${jobs.length} valid jobs (${rawJobs.length - jobs.length} skipped)`);
    saveRawData('remoteok', rawParsed);
    for (let i = 0; i < jobs.length; i++) {
      log.info(`  [RemoteOK] "${jobs[i].title}" at ${jobs[i].company}`);
    }
    return jobs;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`RemoteOK response parsing failed: ${message}`);
    return [];
  }
}

const Web3CareerJobSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  company: z.string().min(1),
  apply_url: z.string().url(),
  date: z.string(),
  is_remote: z.boolean().optional().default(false),
  location: z.string().optional().default(''),
  country: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  salary_min_value: z.union([z.number(), z.string()]).nullable().optional(),
  salary_max_value: z.union([z.number(), z.string()]).nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  salary_unit: z.string().nullable().optional(),
});

type Web3CareerJob = z.infer<typeof Web3CareerJobSchema>;

function normalizeWeb3CareerSalary(raw: Web3CareerJob): Job['salary'] {
  const min = Number(raw.salary_min_value) || 0;
  const max = Number(raw.salary_max_value) || 0;
  const currency = raw.salary_currency ?? '';
  const hasSalary = min > 0 || max > 0;

  return {
    min,
    max,
    currency: hasSalary ? currency || 'USD' : '',
    raw: hasSalary ? `${currency || '$'}${min}-${currency || '$'}${max}` : '',
  };
}

function normalizeWeb3CareerJob(raw: Web3CareerJob): Job {
  return {
    id: generateJobId(raw.title, raw.company),
    title: raw.title,
    company: raw.company,
    url: raw.apply_url,
    salary: normalizeWeb3CareerSalary(raw),
    location: raw.location || raw.country || 'Remote',
    remote: raw.is_remote,
    skills: raw.tags.map((t) => t.toLowerCase()),
    postedAt: new Date(raw.date),
    source: 'web3career',
  };
}

export async function fetchFromWeb3Career(): Promise<Job[]> {
  const token = process.env['WEB3_CAREER_API_KEY'];
  if (!token) {
    log.warn('WEB3_CAREER_API_KEY not set — Web3.Career disabled');
    return [];
  }

  log.info('Fetching jobs from Web3.Career...');

  const url = `${WEB3CAREER_BASE_URL}?token=${token}&remote=true&limit=100`;
  const response = await fetchWithRetry(url);
  if (!response) return [];

  try {
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      log.warn('Web3.Career returned non-array response');
      return [];
    }

    // Response format: [0] metadata string, [1] docs string, [2] jobs array
    const rawJobs: unknown[] = Array.isArray(data[2]) ? data[2] : [];
    const jobs: Job[] = [];
    const rawParsed: Web3CareerJob[] = [];

    for (const item of rawJobs) {
      const result = Web3CareerJobSchema.safeParse(item);
      if (result.success) {
        rawParsed.push(result.data);
        jobs.push(normalizeWeb3CareerJob(result.data));
      } else {
        log.warn(`Skipping invalid Web3.Career job: ${JSON.stringify(result.error.issues[0])}`);
      }
    }

    log.info(`Web3.Career: ${jobs.length} valid jobs (${rawJobs.length - jobs.length} skipped)`);
    saveRawData('web3career', rawParsed);
    for (let i = 0; i < jobs.length; i++) {
      log.info(`  [Web3.Career] "${jobs[i].title}" at ${jobs[i].company}`);
    }
    return jobs;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Web3.Career response parsing failed: ${message}`);
    return [];
  }
}

export async function fetchAllJobs(): Promise<Job[]> {
  const [remoteOKJobs, web3Jobs] = await Promise.all([fetchFromRemoteOK(), fetchFromWeb3Career()]);

  log.info(`Fetched per source — RemoteOK: ${remoteOKJobs.length}, Web3: ${web3Jobs.length}`);

  const allJobs = [...remoteOKJobs, ...web3Jobs];
  const seen = new Set<string>();
  const deduplicated: Job[] = [];
  let duplicateCount = 0;

  for (const job of allJobs) {
    if (seen.has(job.id)) {
      log.info(`Duplicate removed: "${job.title}" at ${job.company} (source: ${job.source})`);
      duplicateCount++;
    } else {
      seen.add(job.id);
      deduplicated.push(job);
    }
  }

  log.info(`Aggregation complete: ${deduplicated.length} unique jobs (${duplicateCount} duplicates removed)`);
  return deduplicated;
}
