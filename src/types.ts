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
