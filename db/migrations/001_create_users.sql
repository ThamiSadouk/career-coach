CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  skills TEXT[] NOT NULL,
  location TEXT,
  salary_minimum NUMERIC,
  salary_period TEXT DEFAULT 'yearly',
  job_type_preference TEXT DEFAULT 'any',
  remote_preference TEXT DEFAULT 'any',
  include_unknowns BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
