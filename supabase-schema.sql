-- ============================================================
-- KCIS — Supabase / PostgreSQL 스키마
-- 모든 테이블 prefix: oncell_
-- 실행: Supabase Dashboard → SQL Editor → New query → 전체 복붙 → Run
-- ============================================================

-- 1. 공동체
create table if not exists oncell_communities (
  id                text primary key,
  name              text not null,
  timezone          text,
  admin_profile_id  text,
  created_at        timestamptz default now()
);

-- 2. 프로필 (앱 내부 사용자 메타)
create table if not exists oncell_profiles (
  profile_id   text primary key,
  provider     text,
  nickname     text,
  real_name    text,
  contact      text,
  email        text,
  updated_at   timestamptz default now()
);

-- 3. OAuth 원본 사용자 정보
create table if not exists oncell_users (
  provider_profile_id text primary key,
  provider            text,
  nickname            text,
  real_name           text,
  email               text,
  contact             text,
  first_login_at      timestamptz,
  last_login_at       timestamptz,
  login_count         integer default 0,
  status              text,
  raw                 jsonb
);

-- 4. 일정 (예배·공동체일정·개인일정·예약 모두 포함)
create table if not exists oncell_events (
  id              text primary key,
  community_id    text,
  title           text not null,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  location        text,
  venue_id        text,
  description     text,
  created_by      text,
  created_by_name text,
  created_at      timestamptz default now(),
  scope           text,            -- community / personal / worship
  shared          boolean default false,
  type            text default 'event',  -- event / reservation
  category        text,            -- 일반예배·특별예배·기도회·특별기도회·행사·기념일·양육·…
  rule            jsonb,           -- RecurrenceRule
  overrides       jsonb            -- per-occurrence overrides
);
create index if not exists idx_oncell_events_community on oncell_events(community_id);
create index if not exists idx_oncell_events_start     on oncell_events(start_at);
create index if not exists idx_oncell_events_creator   on oncell_events(created_by);
create index if not exists idx_oncell_events_type      on oncell_events(type);

-- 5. 예배 서비스 (주보 포함)
create table if not exists oncell_worship_services (
  id            text primary key,
  community_id  text,
  name          text not null,
  start_at      timestamptz,
  is_default    boolean default false,
  published     boolean default false,
  published_at  timestamptz,
  bulletin      jsonb,
  created_at    timestamptz default now()
);
create index if not exists idx_oncell_ws_community on oncell_worship_services(community_id);

-- 6. 장소
create table if not exists oncell_venues (
  id              text primary key,
  floor           text,
  name            text not null,
  code            text,
  available_start text,
  available_end   text,
  available_days  jsonb
);

-- 7. 층 목록
create table if not exists oncell_floors (
  name text primary key,
  ord  integer
);

-- 8. 단발 블럭 (특정 시각 차단)
create table if not exists oncell_venue_blocks (
  id         text primary key,
  venue_id   text,
  start_at   timestamptz,
  end_at     timestamptz,
  reason     text,
  created_at timestamptz default now()
);

-- 9. 반복 블럭 (slot 패턴)
create table if not exists oncell_venue_block_groups (
  id         text primary key,
  venue_id   text,
  slots      jsonb,
  end_date   date,
  reason     text,
  created_at timestamptz default now()
);

-- 10. 공동체별 주보 템플릿 (community_id → JSON)
create table if not exists oncell_community_bulletin_templates (
  community_id text primary key,
  data         jsonb not null,
  updated_at   timestamptz default now()
);

-- 11. 가입 승인 대기/이력
create table if not exists oncell_signup_approvals (
  profile_id      text primary key,
  provider        text,
  nickname        text,
  email           text,
  real_name       text,
  contact         text,
  first_login_at  timestamptz,
  last_login_at   timestamptz,
  login_count     integer default 0,
  status          text default 'pending'
);

-- 12. QT 묵상노트 (profile_id + date 복합키)
create table if not exists oncell_qt_notes (
  profile_id text not null,
  date       date not null,
  reference  text,
  feelings   text default '',
  decision   text default '',
  prayer     text default '',
  text       text,                       -- 구 스키마 호환 필드
  updated_at timestamptz default now(),
  primary key (profile_id, date)
);

-- 13. 일정 구분 목록 (정렬용 ord 포함)
create table if not exists oncell_event_categories (
  name text primary key,
  ord  integer default 0
);

-- 13b. QT 연간 계획 (날짜별 매일성경 본문 범위)
--   매일성경(sum.su.or.kr) AJAX API에서 연초에 시드.
--   scripts/seed-qt-plan.mjs 참고.
create table if not exists oncell_qt_plan (
  date          date primary key,
  book_code     smallint not null,           -- 1-66 (창세기-요한계시록)
  book_name     text not null,
  start_chapter smallint not null,
  start_verse   smallint not null,
  end_chapter   smallint not null,
  end_verse     smallint not null,
  reference     text not null,               -- 표시용: "마태복음 5:3-12"
  created_at    timestamptz default now()
);
create index if not exists idx_oncell_qt_plan_book on oncell_qt_plan(book_code);

-- 13c. 셀 (큐티/통독/암송 모드 다중 활성화 가능한 단위)
--   community_id가 null이면 독립 셀, 아니면 공동체 산하 셀.
--   공동체 산하 셀은 공동체관리자가 통제 (owner_profile_id는 생성자 기록용).
create table if not exists oncell_cells (
  id                     text primary key,
  name                   text not null,
  owner_profile_id       text not null,
  community_id           text references oncell_communities(id) on delete set null,
  approval_mode          text not null default 'auto',          -- 'auto' | 'manual'
  invite_token           text not null unique,                  -- 32+ 자 URL-safe 랜덤
  bundle_community_join  boolean default false,                 -- 공동체 셀일 때 가입 시 공동체 자동 동의 여부
  enabled_modes          jsonb not null default '{"qt":false,"reading":false,"memorize":false,"prayer":false}',
  qt_settings            jsonb,
  reading_settings       jsonb,
  memorize_settings      jsonb,
  prayer_settings        jsonb,
  description            text,
  invite_message         text,
  member_count           integer default 0,
  created_at             timestamptz default now(),
  archived_at            timestamptz
);
create index if not exists idx_oncell_cells_owner     on oncell_cells(owner_profile_id);
create index if not exists idx_oncell_cells_community on oncell_cells(community_id);
create index if not exists idx_oncell_cells_token     on oncell_cells(invite_token);

-- 13d. 셀 멤버십
create table if not exists oncell_cell_members (
  cell_id    text not null references oncell_cells(id) on delete cascade,
  profile_id text not null,
  status     text not null default 'approved',                  -- 'pending' | 'approved' | 'rejected'
  joined_at  timestamptz default now(),
  primary key (cell_id, profile_id)
);
create index if not exists idx_oncell_cell_members_profile on oncell_cell_members(profile_id);
create index if not exists idx_oncell_cell_members_status  on oncell_cell_members(status);

-- 13e. 공동체 멤버십 (1인 1공동체 보장은 앱 로직 — 한도 시스템관리자 설정에서 제어)
create table if not exists oncell_community_members (
  community_id text not null references oncell_communities(id) on delete cascade,
  profile_id   text not null,
  status       text not null default 'approved',
  joined_at    timestamptz default now(),
  primary key (community_id, profile_id)
);
create index if not exists idx_oncell_community_members_profile on oncell_community_members(profile_id);

-- 13f. 공동체 (cell_join_limit 컬럼 추가 — 공동체별 멤버 셀 가입 한도)
-- 기존 oncell_communities 테이블에 컬럼 추가 (이미 있으면 무시)
alter table oncell_communities add column if not exists cell_join_limit integer default 3;
alter table oncell_communities add column if not exists approval_mode   text default 'auto';
alter table oncell_communities add column if not exists description     text;

-- 14. 싱글톤/KV 저장소
--   - settings (settings.json 통째로)
--   - system_admins (system-admins.json: {profileIds:[]})
--   - worship_templates (worship-templates.json: 템플릿 객체)
create table if not exists oncell_app_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- 보안: 모든 테이블 RLS 활성화 (anon 키로는 접근 불가)
-- 서버 사이드 API에서는 service_role 키 사용 → RLS 우회
-- ============================================================
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'oncell_%'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end$$;

-- ============================================================
-- 끝. Run을 누르세요. 모두 정상이면 "Success. No rows returned" 출력.
-- ============================================================
