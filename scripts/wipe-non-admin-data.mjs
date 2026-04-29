// ---------------------------------------------------------------
// 시스템관리자 외 사용자/예약 데이터 일괄 삭제
// 사용:
//   dry-run: node scripts/wipe-non-admin-data.mjs
//   실제삭제: node scripts/wipe-non-admin-data.mjs --execute
//
// 삭제 대상 (관리자 profileId 에 속하지 않는 행):
//   - oncell_profiles
//   - oncell_users (매칭 키는 provider_profile_id)
//   - oncell_signup_approvals
//   - oncell_events WHERE type='reservation'
// 보존: communities, venues, floors, settings, venue_blocks, venue_block_groups,
//       worship_services, community_bulletin_templates, qt_notes, event_categories,
//       events WHERE type='event', app_kv (system_admins 포함)
// ---------------------------------------------------------------
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
const T = (n) => `oncell_${n}`;
const EXECUTE = process.argv.includes('--execute');

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const deleteInChunks = async (table, pkCol, ids) => {
  if (ids.length === 0) return 0;
  let removed = 0;
  for (const c of chunk(ids, 100)) {
    const { error } = await db.from(table).delete().in(pkCol, c);
    if (error) { console.error(`  [${table}] chunk 삭제 실패: ${error.message}`); continue; }
    removed += c.length;
  }
  return removed;
};

const main = async () => {
  // 1) 시스템관리자 id 조회
  const { data: kv, error: e1 } = await db.from(T('app_kv')).select('value').eq('key', 'system_admins').maybeSingle();
  if (e1) throw e1;
  const adminIds = Array.isArray(kv?.value?.profileIds) ? kv.value.profileIds : [];
  console.log(`[관리자] profileIds (${adminIds.length}):`);
  adminIds.forEach((id) => console.log(`  - ${id}`));
  if (adminIds.length === 0) {
    console.error('\n✗ 관리자 ID가 없어 전부 삭제 위험. 안전을 위해 중단합니다.');
    process.exit(1);
  }

  const adminSet = new Set(adminIds);

  // 2) 각 테이블 현재 행 조회 → 삭제 대상 ID 계산
  const plans = [];

  // profiles (pk: profile_id)
  {
    const { data, error } = await db.from(T('profiles')).select('profile_id');
    if (error) throw error;
    const all = (data || []).map((r) => r.profile_id);
    const del = all.filter((id) => !adminSet.has(id));
    plans.push({ table: T('profiles'), pk: 'profile_id', before: all.length, del });
  }
  // users (pk: provider_profile_id)
  {
    const { data, error } = await db.from(T('users')).select('provider_profile_id');
    if (error) throw error;
    const all = (data || []).map((r) => r.provider_profile_id);
    const del = all.filter((id) => !adminSet.has(id));
    plans.push({ table: T('users'), pk: 'provider_profile_id', before: all.length, del });
  }
  // signup_approvals (pk: profile_id)
  {
    const { data, error } = await db.from(T('signup_approvals')).select('profile_id');
    if (error) throw error;
    const all = (data || []).map((r) => r.profile_id);
    const del = all.filter((id) => !adminSet.has(id));
    plans.push({ table: T('signup_approvals'), pk: 'profile_id', before: all.length, del });
  }
  // events where type='reservation' and created_by not in admins (pk: id)
  {
    const { data, error } = await db.from(T('events')).select('id, type, created_by');
    if (error) throw error;
    const all = data || [];
    const del = all
      .filter((r) => r.type === 'reservation' && !adminSet.has(r.created_by))
      .map((r) => r.id);
    plans.push({ table: T('events'), pk: 'id', before: all.length, del, note: "type='reservation' & 관리자 외" });
  }

  console.log('\n[삭제 예정]');
  console.table(plans.map((p) => ({
    table: p.table,
    before: p.before,
    willDelete: p.del.length,
    after: p.before - p.del.length,
    note: p.note || '',
  })));

  if (!EXECUTE) {
    console.log('\n→ dry-run (--execute 플래그 없음). 실제 삭제하려면:');
    console.log('  node scripts/wipe-non-admin-data.mjs --execute');
    return;
  }

  console.log('\n=== 실제 삭제 실행 ===');
  for (const p of plans) {
    const removed = await deleteInChunks(p.table, p.pk, p.del);
    console.log(`✓ ${p.table}: ${removed} 행 삭제`);
  }
  console.log('\n완료.');
};

main().catch((e) => { console.error('\n✗ 오류:', e); process.exit(1); });
