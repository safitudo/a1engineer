-- A1 Engineer v2 — Initial Schema
-- Migration: 001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core tables

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT 'Default',
  memory_md TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
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

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  team_id UUID REFERENCES teams(id),
  agent_id UUID REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT[],
  status TEXT DEFAULT 'queued',
  context_md TEXT,
  constraints JSONB DEFAULT '{}',
  artifacts JSONB DEFAULT '[]',
  parent_task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  adapter TEXT DEFAULT 'irc',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'stopped',
  container_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: default tenant + default team
DO $$
DECLARE
  v_tenant_id UUID;
  v_team_id UUID;
BEGIN
  -- Only seed if no tenants exist
  IF NOT EXISTS (SELECT 1 FROM tenants LIMIT 1) THEN
    -- bcrypt hash of 'changeme' (12 rounds) — update before use in production
    INSERT INTO tenants (email, password_hash)
    VALUES ('admin@a1.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiLXcKmxs.7y')
    RETURNING id INTO v_tenant_id;

    INSERT INTO teams (tenant_id, name)
    VALUES (v_tenant_id, 'Default')
    RETURNING id INTO v_team_id;

    RAISE NOTICE 'Seeded: tenant % / team %', v_tenant_id, v_team_id;
  END IF;
END $$;
