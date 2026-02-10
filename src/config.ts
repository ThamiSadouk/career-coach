import { z } from 'zod';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { log } from './logger.js';

export const ConfigSchema = z.object({
  user: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    timezone: z.string().default('UTC'),
  }),
  preferences: z.object({
    skills: z.array(z.string()).min(1, 'At least one skill required'),
    salaryMinimum: z.number().positive('Salary must be positive'),
    location: z.string(),
  }),
  hardNos: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  log.info(`Loading config from ${path}`);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    throw new Error(`Config file not found: ${path}`);
  }

  const parsed: unknown = YAML.parse(raw);
  return ConfigSchema.parse(parsed);
}
