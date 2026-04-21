// ---------------------------------------------------------------
// Supabase / PostgreSQL client + 테이블명 헬퍼.
// 서버 사이드(api routes)에서만 사용. service_role 키가 RLS를 우회.
//
// 환경변수:
//   - NEXT_PUBLIC_SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY (서버 전용, 절대 노출 금지)
//
// 사용 예:
//   import { db, T } from '@/lib/db';
//   const { data, error } = await db.from(T.events).select('*').eq('community_id', id);
// ---------------------------------------------------------------

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  // import 시점에 에러 던지진 않음 — 런타임에만 영향.
  // eslint-disable-next-line no-console
  console.warn('[lib/db] SUPABASE_URL or SERVICE_ROLE_KEY missing — DB calls will fail.');
}

let _client: SupabaseClient | null = null;
const getClient = (): SupabaseClient => {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
  return _client;
};

export const db = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return Reflect.get(getClient() as any, prop);
  },
});

// ---------------------------------------------------------------
// 테이블명 한 곳에서 관리. prefix 변경 시 여기만 수정.
// ---------------------------------------------------------------
export const TABLE_PREFIX = 'kcis_';

export const T = {
  communities: `${TABLE_PREFIX}communities`,
  profiles: `${TABLE_PREFIX}profiles`,
  users: `${TABLE_PREFIX}users`,
  events: `${TABLE_PREFIX}events`,
  worshipServices: `${TABLE_PREFIX}worship_services`,
  venues: `${TABLE_PREFIX}venues`,
  floors: `${TABLE_PREFIX}floors`,
  venueBlocks: `${TABLE_PREFIX}venue_blocks`,
  venueBlockGroups: `${TABLE_PREFIX}venue_block_groups`,
  communityBulletinTemplates: `${TABLE_PREFIX}community_bulletin_templates`,
  signupApprovals: `${TABLE_PREFIX}signup_approvals`,
  qtNotes: `${TABLE_PREFIX}qt_notes`,
  eventCategories: `${TABLE_PREFIX}event_categories`,
  appKv: `${TABLE_PREFIX}app_kv`,
} as const;

// ---------------------------------------------------------------
// app_kv (싱글톤 JSON 저장소) 헬퍼
// ---------------------------------------------------------------
export const KV_KEYS = {
  settings: 'settings',
  systemAdmins: 'system_admins',
  worshipTemplates: 'worship_templates',
} as const;

export const kvGet = async <T = any>(key: string): Promise<T | null> => {
  const { data, error } = await db.from(T.appKv).select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
};

export const kvSet = async (key: string, value: any): Promise<void> => {
  const { error } = await db
    .from(T.appKv)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
};

// ---------------------------------------------------------------
// camelCase ↔ snake_case 변환 (JSON ↔ DB row)
// 기존 코드의 객체 구조 (id, communityId, startAt 등) 와
// DB의 snake_case 컬럼 사이의 어댑터.
// ---------------------------------------------------------------
const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export const toSnake = <T = any>(obj: any): T => {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj as T;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    out[camelToSnake(k)] = v;
  }
  return out as T;
};

export const toCamel = <T = any>(obj: any): T => {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj as T;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    out[snakeToCamel(k)] = obj[k];
  }
  return out as T;
};

export const toCamelArr = <T = any>(arr: any[]): T[] => (arr || []).map((x) => toCamel<T>(x));
