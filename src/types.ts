import { z } from 'zod';

export const UserProfileSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  skills: z.array(z.string()).min(1),
  location: z.string().nullable(),
  salaryMinimum: z.number().nullable(),
  salaryPeriod: z.string(),
  jobTypePreference: z.string(),
  remotePreference: z.string(),
  includeUnknowns: z.boolean(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export type CreateUserInput = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt' | 'active'>;

export type UpdateUserInput = Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt' | 'active'>>;

// --- Job Source ---
export const JobSourceSchema = z.enum(['remoteok', 'web3career', 'jsearch']);
export type JobSource = z.infer<typeof JobSourceSchema>;

// --- Salary ---
export const SalarySchema = z.object({
  min: z.number(),
  max: z.number(),
  currency: z.string(),
  period: z.enum(['yearly', 'daily', 'hourly', 'unknown']),
  raw: z.string(),
});
export type Salary = z.infer<typeof SalarySchema>;

// --- Job ---
export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  salary: SalarySchema,
  location: z.string(),
  remoteStatus: z.enum(['remote', 'onsite', 'hybrid', 'unknown']),
  jobType: z.enum(['permanent', 'freelance', 'contract', 'unknown']),
  skills: z.array(z.string()),
  postedAt: z.date(),
  source: JobSourceSchema,
});
export type Job = z.infer<typeof JobSchema>;

// --- MatchResult ---
export const MatchResultSchema = z.object({
  job: JobSchema,
  score: z.number(),
  matchedSkills: z.array(z.string()),
  explanation: z.array(z.string()),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

// --- RunStatus (V1.1 — per-source + per-user) ---
export const SourceResultSchema = z.object({
  count: z.number(),
  success: z.boolean(),
});

export const UserResultSchema = z.object({
  user: z.string(),
  success: z.boolean(),
  matchCount: z.number(),
  emailSent: z.boolean(),
  error: z.string().optional(),
});

export const RunStatusSchema = z.object({
  timestamp: z.string(),
  durationMs: z.number(),
  jobsFetched: z.number(),
  sourceResults: z.object({
    remoteok: SourceResultSchema,
    web3career: SourceResultSchema,
    jsearch: SourceResultSchema,
  }).partial(),
  userResults: z.array(UserResultSchema),
  pipelineSuccess: z.boolean(),
});
export type RunStatus = z.infer<typeof RunStatusSchema>;
