import { createHash } from 'node:crypto';
import { z } from 'zod';
import { log } from '../logger.js';
import { fetchWithRetry } from '../utils/http.js';
import type { Job } from '../types.js';

const REMOTEOK_URL = 'https://remoteok.com/api';

const RemoteOKJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
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

function generateJobId(title: string, company: string): string {
  const input = `${title}${company}`.toLowerCase();
  return createHash('sha256').update(input).digest('hex');
}

function normalizeJob(raw: RemoteOKJob): Job {
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
      period: hasSalary ? 'yearly' : 'unknown',
      raw: hasSalary ? `$${raw.salary_min}-$${raw.salary_max}` : '',
    },
    location: raw.location || 'Remote',
    remoteStatus: 'remote',
    jobType: 'permanent',
    skills: raw.tags.map((t) => t.toLowerCase()),
    postedAt: new Date(raw.date),
    source: 'remoteok',
  };
}

export async function fetchJobs(): Promise<Job[]> {
  log.info('Fetching jobs from RemoteOK...');

  const response = await fetchWithRetry(REMOTEOK_URL, {
    headers: { 'User-Agent': 'career-coach/1.0' },
  });
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
        jobs.push(normalizeJob(result.data));
      } else {
        log.warn(`Skipping invalid RemoteOK job: ${result.error.issues[0]?.message}`);
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
