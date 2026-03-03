-- Idempotent migration: run on every startup
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT 'Default',
  memory_md TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  team_id UUID REFERENCES teams(id),
  name TEXT NOT NULL,
  role TEXT,
  mode TEXT NOT NULL DEFAULT 'persistent',
  keep_context BOOLEAN DEFAULT false,
  runtime TEXT NOT NULL DEFAULT 'claude-code',
  model TEXT DEFAULT 'claude-sonnet-4-20250514',
  effort TEXT DEFAULT 'high',
  auth_mode TEXT DEFAULT 'session',
  status TEXT DEFAULT 'ghost',
  container_id TEXT,
  channel_subscriptions TEXT[] DEFAULT '{}',
  plugins TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  team_id UUID REFERENCES teams(id),
  agent_id UUID REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'queued',
  context_md TEXT,
  constraints JSONB DEFAULT '{}',
  artifacts JSONB DEFAULT '[]',
  parent_task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  adapter TEXT DEFAULT 'irc',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'stopped',
  container_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: default tenant (dev only, idempotent)
INSERT INTO tenants (id, email, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@localhost',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LdFBFLKGApMdWXXiW'  -- password: localdev
) ON CONFLICT (email) DO NOTHING;

-- Seed: default team for default tenant (idempotent)
INSERT INTO teams (id, tenant_id, name)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Default'
) ON CONFLICT DO NOTHING;
