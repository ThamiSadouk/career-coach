import { createHash } from 'node:crypto';
import { z } from 'zod';
import { log } from '../logger.js';
import { fetchWithRetry } from '../utils/http.js';
import type { Job } from '../types.js';

const JSEARCH_URL = 'https://jsearch.p.rapidapi.com/search';
const JSEARCH_HOST = 'jsearch.p.rapidapi.com';
const SEARCH_QUERY = 'developer';
const NUM_PAGES = '1';

const JSearchJobSchema = z.object({
  job_id: z.string(),
  job_title: z.string().min(1),
  employer_name: z.string().min(1),
  job_apply_link: z.string().url(),
  job_is_remote: z.boolean().optional().default(false),
  job_employment_type: z.string().optional().default(''),
  job_city: z.string().nullable().optional(),
  job_state: z.string().nullable().optional(),
  job_country: z.string().nullable().optional(),
  job_min_salary: z.number().nullable().optional(),
  job_max_salary: z.number().nullable().optional(),
  job_salary_currency: z.string().nullable().optional(),
  job_salary_period: z.string().nullable().optional(),
  job_required_skills: z.array(z.string()).nullable().optional(),
  job_posted_at_datetime_utc: z.string(),
});

type JSearchJob = z.infer<typeof JSearchJobSchema>;

function generateJobId(title: string, company: string): string {
  const input = `${title}${company}`.toLowerCase();
  return createHash('sha256').update(input).digest('hex');
}

function mapEmploymentType(type: string): 'permanent' | 'freelance' | 'contract' | 'unknown' {
  switch (type) {
    case 'FULLTIME':
    case 'PARTTIME':
      return 'permanent';
    case 'CONTRACTOR':
      return 'contract';
    default:
      return 'unknown';
  }
}

function mapSalaryPeriod(
  period: string | null | undefined,
): 'yearly' | 'daily' | 'hourly' | 'unknown' {
  switch (period) {
    case 'YEAR':
      return 'yearly';
    case 'HOUR':
      return 'hourly';
    default:
      return 'unknown';
  }
}

function normalizeJob(raw: JSearchJob): Job {
  const min = raw.job_min_salary ?? 0;
  const max = raw.job_max_salary ?? 0;
  const currency = raw.job_salary_currency ?? '';
  const hasSalary = min > 0 || max > 0;
  const period = mapSalaryPeriod(raw.job_salary_period);

  return {
    id: generateJobId(raw.job_title, raw.employer_name),
    title: raw.job_title,
    company: raw.employer_name,
    url: raw.job_apply_link,
    salary: {
      min,
      max,
      currency: hasSalary ? currency || 'USD' : '',
      period: hasSalary ? period : 'unknown',
      raw: hasSalary ? `${currency || '$'}${min}-${currency || '$'}${max}` : '',
    },
    location:
      [raw.job_city, raw.job_state, raw.job_country].filter(Boolean).join(', ') || 'Unknown',
    remoteStatus: raw.job_is_remote ? 'remote' : 'unknown',
    jobType: mapEmploymentType(raw.job_employment_type),
    skills: (raw.job_required_skills ?? []).map((s) => s.toLowerCase()),
    postedAt: new Date(raw.job_posted_at_datetime_utc),
    source: 'jsearch',
  };
}

export async function fetchJobs(): Promise<Job[]> {
  const apiKey = process.env['JSEARCH_API_KEY'];
  if (!apiKey) {
    log.warn('JSEARCH_API_KEY not set — JSearch disabled');
    return [];
  }

  log.info('Fetching jobs from JSearch...');

  const url = `${JSEARCH_URL}?query=${encodeURIComponent(SEARCH_QUERY)}&num_pages=${NUM_PAGES}`;
  const response = await fetchWithRetry(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': JSEARCH_HOST,
      'User-Agent': 'career-coach/1.0',
    },
  });
  if (!response) return [];

  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('data' in body)) {
      log.warn('JSearch returned unexpected response format');
      return [];
    }

    const data = (body as { data: unknown }).data;
    if (!Array.isArray(data)) {
      log.warn('JSearch response data is not an array');
      return [];
    }

    const jobs: Job[] = [];

    for (const item of data) {
      const result = JSearchJobSchema.safeParse(item);
      if (result.success) {
        jobs.push(normalizeJob(result.data));
      } else {
        log.warn(`Skipping invalid JSearch job: ${result.error.issues[0]?.message}`);
      }
    }

    log.info(`JSearch: ${jobs.length} valid jobs (${data.length - jobs.length} skipped)`);
    return jobs;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`JSearch response parsing failed: ${message}`);
    return [];
  }
}
