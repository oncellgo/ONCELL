// ---------------------------------------------------------------
// data/*.json → Supabase 일회성 시딩 스크립트
// 사용: node scripts/seed-supabase.mjs
// ---------------------------------------------------------------
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드 (dotenv 미사용)
const envPath = path.resolve('.env.local');
if (existsSync(envPath)) {
  for (const l of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TABLE_PREFIX = 'kcis_';
const T = (name) => `${TABLE_PREFIX}${name}`;

const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toSnake = (obj) => {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const k of Object.keys(obj)) out[camelToSnake(k)] = obj[k];
  return out;
};

const readJSON = (file) => {
  const p = path.join('data', file);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};

const seed = async (label, table, rows, opts = {}) => {
  if (!rows || rows.length === 0) {
    console.log(`  ${label}: skip (no rows)`);
    return;
  }
  const conflict = opts.onConflict;
  const { error, count } = await db
    .from(table)
    .upsert(rows, conflict ? { onConflict: conflict } : undefined)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`  ❌ ${label}:`, error.message);
    return;
  }
  console.log(`  ✅ ${label}: ${rows.length} rows upserted`);
};

const seedKv = async (key, value) => {
  if (value === null || value === undefined) {
    console.log(`  app_kv[${key}]: skip (null)`);
    return;
  }
  const { error } = await db
    .from(T('app_kv'))
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error(`  ❌ app_kv[${key}]:`, error.message);
  else console.log(`  ✅ app_kv[${key}]: stored`);
};

(async () => {
  console.log('🌱 Seeding Supabase...');

  // 1. communities
  {
    const arr = readJSON('communities.json') || [];
    await seed('communities', T('communities'), arr.map(toSnake), { onConflict: 'id' });
  }

  // 2. profiles
  {
    const arr = readJSON('profiles.json') || [];
    await seed('profiles', T('profiles'), arr.map(toSnake), { onConflict: 'profile_id' });
  }

  // 3. users
  {
    const arr = readJSON('users.json') || [];
    await seed('users', T('users'), arr.map(toSnake), { onConflict: 'provider_profile_id' });
  }

  // 4. events
  {
    const arr = readJSON('events.json') || [];
    const rows = arr.map((e) => {
      const r = toSnake(e);
      // rule / overrides 는 jsonb. 이미 객체면 그대로.
      return r;
    });
    await seed('events', T('events'), rows, { onConflict: 'id' });
  }

  // 5. worship_services
  {
    const arr = readJSON('worship-services.json') || [];
    await seed('worship_services', T('worship_services'), arr.map(toSnake), { onConflict: 'id' });
  }

  // 6. venues
  {
    const arr = readJSON('venues.json') || [];
    await seed('venues', T('venues'), arr.map(toSnake), { onConflict: 'id' });
  }

  // 7. floors (배열 of string → rows)
  {
    const arr = readJSON('floors.json') || [];
    const rows = arr.map((name, i) => ({ name, ord: i }));
    await seed('floors', T('floors'), rows, { onConflict: 'name' });
  }

  // 8. venue_blocks
  {
    const arr = readJSON('venue-blocks.json') || [];
    await seed('venue_blocks', T('venue_blocks'), arr.map(toSnake), { onConflict: 'id' });
  }

  // 9. venue_block_groups
  {
    const arr = readJSON('venue-block-groups.json') || [];
    await seed('venue_block_groups', T('venue_block_groups'), arr.map(toSnake), { onConflict: 'id' });
  }

  // 10. community_bulletin_templates (object: {communityId: {...}, ...})
  {
    const obj = readJSON('community-bulletin-templates.json') || {};
    const rows = Object.entries(obj).map(([cid, data]) => ({
      community_id: cid,
      data,
      updated_at: new Date().toISOString(),
    }));
    await seed('community_bulletin_templates', T('community_bulletin_templates'), rows, { onConflict: 'community_id' });
  }

  // 11. signup_approvals
  {
    const arr = readJSON('signup-approvals.json') || [];
    await seed('signup_approvals', T('signup_approvals'), arr.map(toSnake), { onConflict: 'profile_id' });
  }

  // 12. qt_notes
  {
    const arr = readJSON('qt-notes.json') || [];
    await seed('qt_notes', T('qt_notes'), arr.map(toSnake), { onConflict: 'profile_id,date' });
  }

  // 13. event_categories (배열 of string → rows)
  {
    const arr = readJSON('event-categories.json') || [];
    const rows = arr.map((name, i) => ({ name, ord: i }));
    await seed('event_categories', T('event_categories'), rows, { onConflict: 'name' });
  }

  // 14. app_kv (싱글톤들)
  await seedKv('settings', readJSON('settings.json'));
  await seedKv('system_admins', readJSON('system-admins.json'));
  await seedKv('worship_templates', readJSON('worship-templates.json'));

  console.log('🎉 Seeding complete.');
})();
