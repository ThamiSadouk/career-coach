import { createHash } from 'node:crypto';
import { z } from 'zod';
import { log } from '../logger.js';
import { fetchWithRetry } from '../utils/http.js';
import type { Job } from '../types.js';

const WEB3CAREER_BASE_URL = 'https://web3.career/api/v1';

const Web3CareerJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
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

function generateJobId(title: string, company: string): string {
  const input = `${title}${company}`.toLowerCase();
  return createHash('sha256').update(input).digest('hex');
}

function normalizeSalary(raw: Web3CareerJob): Job['salary'] {
  const min = Number(raw.salary_min_value) || 0;
  const max = Number(raw.salary_max_value) || 0;
  const currency = raw.salary_currency ?? '';
  const hasSalary = min > 0 || max > 0;

  return {
    min,
    max,
    currency: hasSalary ? currency || 'USD' : '',
    period: hasSalary ? 'yearly' : 'unknown',
    raw: hasSalary ? `${currency || '$'}${min}-${currency || '$'}${max}` : '',
  };
}

function normalizeJob(raw: Web3CareerJob): Job {
  return {
    id: generateJobId(raw.title, raw.company),
    title: raw.title,
    company: raw.company,
    url: raw.apply_url,
    salary: normalizeSalary(raw),
    location: raw.location || raw.country || 'Remote',
    remoteStatus: raw.is_remote ? 'remote' : 'unknown',
    jobType: 'unknown',
    skills: raw.tags.map((t) => t.toLowerCase()),
    postedAt: new Date(raw.date),
    source: 'web3career',
  };
}

export async function fetchJobs(): Promise<Job[]> {
  const token = process.env['WEB3_CAREER_API_KEY'];
  if (!token) {
    log.warn('WEB3_CAREER_API_KEY not set — Web3.Career disabled');
    return [];
  }

  log.info('Fetching jobs from Web3.Career...');

  const url = `${WEB3CAREER_BASE_URL}?token=${token}&remote=true&limit=100`;
  const response = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'career-coach/1.0' },
  });
  if (!response) return [];

  try {
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      log.warn('Web3.Career returned non-array response');
      return [];
    }

    // Response format: [0] metadata string, [1] docs string, [2] jobs array
    if (!Array.isArray(data[2])) {
      log.warn(`Web3.Career response missing jobs array at index 2 (got ${data.length} elements)`);
    }
    const rawJobs: unknown[] = Array.isArray(data[2]) ? data[2] : [];
    const jobs: Job[] = [];

    for (const item of rawJobs) {
      const result = Web3CareerJobSchema.safeParse(item);
      if (result.success) {
        jobs.push(normalizeJob(result.data));
      } else {
        log.warn(`Skipping invalid Web3.Career job: ${result.error.issues[0]?.message}`);
      }
    }

    log.info(`Web3.Career: ${jobs.length} valid jobs (${rawJobs.length - jobs.length} skipped)`);
    return jobs;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Web3.Career response parsing failed: ${message}`);
    return [];
  }
}
