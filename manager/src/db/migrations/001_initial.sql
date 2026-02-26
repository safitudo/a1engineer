-- 001_initial.sql — Multi-tenant schema for A1 Engineer

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id   ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_team_id    ON agents(team_id);
