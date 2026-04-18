-- ============================================================
-- KCIS — Postgres schema
-- Designed for Neon (Vercel Storage integration)
-- Run once against your Neon database to provision all tables.
-- ============================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ----- communities ------------------------------------------
CREATE TABLE IF NOT EXISTS communities (
  id                  TEXT PRIMARY KEY,                 -- e.g. 'community-1776196066099'
  name                TEXT NOT NULL,
  admin_profile_id    TEXT,
  join_approval_mode  TEXT NOT NULL DEFAULT 'auto',     -- 'auto' | 'admin'
  require_real_name   BOOLEAN NOT NULL DEFAULT TRUE,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Seoul',
  -- Plan / credits (from lib/plans.ts integration)
  plan                TEXT NOT NULL DEFAULT 'free',     -- 'free' | 'plus' | 'church'
  ai_credits          INTEGER NOT NULL DEFAULT 10000,
  purchased_credits   INTEGER NOT NULL DEFAULT 0,
  last_quota_reset_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- system_admins ----------------------------------------
CREATE TABLE IF NOT EXISTS system_admins (
  profile_id  TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- users (community members) ----------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id              TEXT PRIMARY KEY,                -- e.g. 'registration-1776196066106-8275'
  provider             TEXT NOT NULL,                   -- 'kakao' | etc
  provider_profile_id  TEXT NOT NULL,                   -- e.g. 'kakao-4841865666'
  community_id         TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  community_name       TEXT,
  nickname             TEXT,
  real_name            TEXT,
  contact              TEXT,
  profile              JSONB,                           -- provider-specific profile payload
  membership_status    TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'pending'
  registered_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_provider_profile_id_idx ON users (provider_profile_id);
CREATE INDEX IF NOT EXISTS users_community_id_idx         ON users (community_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_profile_community_uniq ON users (provider_profile_id, community_id);

-- ----- events (calendar) ------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY,
  community_id     TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  created_by       TEXT,
  created_by_name  TEXT,
  scope            TEXT NOT NULL DEFAULT 'personal',    -- 'community' | 'personal' | 'worship' (legacy)
  shared           BOOLEAN NOT NULL DEFAULT FALSE,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  location         TEXT,
  description      TEXT,
  recurrence_id    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_community_start_idx ON events (community_id, start_at);
CREATE INDEX IF NOT EXISTS events_recurrence_idx      ON events (recurrence_id);

-- ----- worship_services (+ bulletin JSONB) ------------------
-- One row per scheduled worship service.
-- bulletin: nullable — when null and bulletin_template_id is set, this is a stub
-- referencing another service's bulletin.
CREATE TABLE IF NOT EXISTS worship_services (
  id                    TEXT PRIMARY KEY,
  community_id          TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  start_at              TIMESTAMPTZ,                    -- may be '' historically; use null
  created_by            TEXT,
  bulletin              JSONB,                          -- { design: {...}, content: {...} }
  bulletin_template_id  TEXT,                           -- reference to another worship_services.id for stubs
  recurrence_id         TEXT,                           -- batch grouping for series delete
  is_default            BOOLEAN NOT NULL DEFAULT FALSE, -- community default template marker
  published             BOOLEAN NOT NULL DEFAULT FALSE,
  published_at          TIMESTAMPTZ,
  edited_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worship_services_community_start_idx ON worship_services (community_id, start_at);
CREATE INDEX IF NOT EXISTS worship_services_recurrence_idx      ON worship_services (recurrence_id);
CREATE INDEX IF NOT EXISTS worship_services_template_ref_idx    ON worship_services (bulletin_template_id);

-- ----- community_bulletin_templates -------------------------
-- One row per community. Stores the community's master template (design + content).
CREATE TABLE IF NOT EXISTS community_bulletin_templates (
  community_id  TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  template      JSONB NOT NULL,                         -- { design: {...}, content: {...} }
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- worship_templates (system-wide) ----------------------
-- Single-row table holding the system default template.
-- Use id = 'system' as the sentinel row key.
CREATE TABLE IF NOT EXISTS worship_templates (
  id          TEXT PRIMARY KEY,                         -- 'system'
  template    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- usage_logs (credits / AI / publishing) --------------
CREATE TABLE IF NOT EXISTS usage_logs (
  id              TEXT PRIMARY KEY,
  community_id    TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  profile_id      TEXT,
  action          TEXT NOT NULL,                        -- 'ai_translate' | 'pdf_export' | ...
  cost            INTEGER NOT NULL DEFAULT 0,
  balance_after   INTEGER,
  metadata        JSONB,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_logs_community_at_idx ON usage_logs (community_id, at DESC);
CREATE INDEX IF NOT EXISTS usage_logs_action_idx        ON usage_logs (action);

-- ----- translations_cache -----------------------------------
-- Keyed by sha256(srcLang:tgtLang:src) truncated to 32 chars.
CREATE TABLE IF NOT EXISTS translations_cache (
  key         TEXT PRIMARY KEY,
  src         TEXT NOT NULL,
  src_lang    TEXT NOT NULL,
  tgt_lang    TEXT NOT NULL,
  result      TEXT NOT NULL,
  translator  TEXT NOT NULL,                            -- 'mock' | 'openai' | 'deepl' etc
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- updated_at trigger (for communities) ----------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS communities_updated_at ON communities;
CREATE TRIGGER communities_updated_at
BEFORE UPDATE ON communities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS community_bulletin_templates_updated_at ON community_bulletin_templates;
CREATE TRIGGER community_bulletin_templates_updated_at
BEFORE UPDATE ON community_bulletin_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS worship_templates_updated_at ON worship_templates;
CREATE TRIGGER worship_templates_updated_at
BEFORE UPDATE ON worship_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
