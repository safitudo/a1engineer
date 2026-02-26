-- 001_initial.sql — Phase 1 schema for A1 Engineer

CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  repo        JSONB NOT NULL DEFAULT '{}',
  config      JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'creating',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id          TEXT NOT NULL,
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  model       TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  last_heartbeat TIMESTAMPTZ,
  PRIMARY KEY (id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_team_id ON agents(team_id);
