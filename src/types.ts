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

export type JobSource = 'remoteok' | 'web3career';

export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  salary: {
    min: number;
    max: number;
    currency: string;
    raw: string;
  };
  location: string;
  remote: boolean;
  skills: string[];
  postedAt: Date;
  source: JobSource;
}

export interface MatchResult {
  job: Job;
  score: number;
  matchedSkills: string[];
  explanation: string[];
}

export interface RunStatus {
  timestamp: string;
  success: boolean;
  jobsFetched: number;
  jobsMatched: number;
  emailSent: boolean;
  durationMs: number;
  errors: string[];
  topMatches: MatchResult[];
}
