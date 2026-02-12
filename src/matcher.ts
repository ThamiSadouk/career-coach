import { log } from './logger.js';
import type { Job, MatchResult } from './types.js';
import type { Config } from './config.js';

function filterHardNos(jobs: Job[], hardNos: string[]): Job[] {
  if (hardNos.length === 0) {
    log.info('No Hard No filters configured — all jobs pass through');
    return jobs;
  }

  const patterns = hardNos.map((p) => p.toLowerCase());
  const passed: Job[] = [];
  let excluded = 0;

  for (const job of jobs) {
    const searchable = [job.title, job.company, ...job.skills].map((s) => s.toLowerCase());

    const matched = patterns.filter((pattern) => searchable.some((field) => field.includes(pattern)));

    if (matched.length > 0) {
      log.info(`Hard No: excluded "${job.title}" at ${job.company} — matched: ${matched.join(', ')}`);
      excluded++;
    } else {
      passed.push(job);
    }
  }

  log.info(`Hard No filtering: ${excluded} jobs excluded, ${passed.length} jobs remaining`);
  return passed;
}

const TOP_MATCHES = 10;

function scoreJob(job: Job, config: Config): { score: number; matchedSkills: string[] } {
  const userSkills = config.preferences.skills.map((s) => s.toLowerCase());
  const jobSkills = job.skills.map((s) => s.toLowerCase());

  const matchedSkills = userSkills.filter((skill) =>
    jobSkills.some((js) => js === skill),
  );

  // Skill match: (matched / total user skills) * 100
  const skillScore = (matchedSkills.length / userSkills.length) * 100;

  // Salary bonus: +10 if meets or exceeds minimum
  const salaryBonus = job.salary.min >= config.preferences.salaryMinimum ? 10 : 0;

  // Remote/location bonus: +10 if location matches user preference
  const userLocation = config.preferences.location.toLowerCase();
  const jobLocation = job.location.toLowerCase();
  const locationBonus = jobLocation.includes(userLocation) || userLocation.includes('remote') ? 10 : 0;

  const score = Math.min(100, Math.round(skillScore + salaryBonus + locationBonus));
  return { score, matchedSkills };
}

function generateExplanation(job: Job, matchedSkills: string[], config: Config): string[] {
  const userSkillCount = config.preferences.skills.length;
  const lines: string[] = [];

  // Line 1: Skills
  if (matchedSkills.length === userSkillCount) {
    lines.push(`Skills: 100% match (all ${userSkillCount} skills)`);
  } else {
    lines.push(`Skills: ${matchedSkills.length}/${userSkillCount} match (${matchedSkills.join(', ')})`);
  }

  // Line 2: Salary
  if (job.salary.min > 0) {
    const meetsMin = job.salary.min >= config.preferences.salaryMinimum;
    lines.push(
      `Salary: ${job.salary.raw}${meetsMin ? ' — meets your minimum' : ` — below your $${config.preferences.salaryMinimum} minimum`}`,
    );
  } else {
    lines.push('Salary: Not disclosed');
  }

  // Line 3: Remote
  if (job.remote) {
    lines.push(`Remote: Yes (${job.location})`);
  } else {
    lines.push(`Remote: Not specified (${job.location})`);
  }

  return lines;
}

export function matchJobs(jobs: Job[], config: Config): MatchResult[] {
  // Step 1: Hard No filtering
  const filtered = filterHardNos(jobs, config.hardNos);

  // Step 2: Score all jobs
  const scored: MatchResult[] = filtered.map((job) => {
    const { score, matchedSkills } = scoreJob(job, config);
    const explanation = generateExplanation(job, matchedSkills, config);
    return { job, score, matchedSkills, explanation };
  });

  // Step 3: Sort by score descending, then by most recent date
  scored.sort((a, b) => b.score - a.score || b.job.postedAt.getTime() - a.job.postedAt.getTime());
  const topMatches = scored.slice(0, TOP_MATCHES);

  log.info(`Scoring: ${scored.length} jobs scored, top ${topMatches.length} selected`);
  for (const m of topMatches) {
    log.info(`  Score ${m.score}: "${m.job.title}" at ${m.job.company}`);
    for (const line of m.explanation) {
      log.info(`    ${line}`);
    }
  }

  return topMatches;
}
