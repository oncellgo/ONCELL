// ---------------------------------------------------------------
// kcis_app_kv.system_admins 를 "가입자 단위" 엔티티 배열로 이관.
//
// 이전 포맷: { profileIds: [...], emails: [...] }
// 새   포맷: { admins: [ { id, label, email, profileIds, role, addedAt, ... } ] }
//
// 병합 규칙:
//   - 같은 사용자(같은 사람)의 Kakao profileId 와 Google profileId / email 이 엮일 수 있음.
//   - kcis_signup_approvals 를 보조로 써서 profileId ↔ email 매핑을 추정.
//     (signup_approvals 한 row 는 한 가입자 = 한 provider, email 컬럼 존재)
//   - 동일 email 을 공유하는 profileId 들을 한 엔티티로 묶음.
//   - email 매핑이 없는 profileId 는 독립 엔티티. 운영자가 수동으로 합치면 됨.
//
// 사용:
//   dry-run : node scripts/migrate-system-admins.mjs
//   실행    : node scripts/migrate-system-admins.mjs --execute
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const EXECUTE = process.argv.includes('--execute');
const KV_TABLE = 'kcis_app_kv';
const KV_KEY = 'system_admins';

const normEmail = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

async function main() {
  // 1) 현재 system_admins KV 읽기
  const { data: kvRow, error: kvErr } = await db
    .from(KV_TABLE)
    .select('value')
    .eq('key', KV_KEY)
    .maybeSingle();
  if (kvErr) { console.error('system_admins 읽기 실패:', kvErr.message); process.exit(1); }
  const current = kvRow?.value || null;
  console.log('[현재 값]');
  console.log(JSON.stringify(current, null, 2));
  console.log();

  if (current && Array.isArray(current.admins)) {
    console.log('→ 이미 새 포맷 입니다. 마이그레이션 불필요.');
    return;
  }

  const legacyProfileIds = Array.isArray(current?.profileIds) ? current.profileIds.map(String) : [];
  const legacyEmails = Array.isArray(current?.emails) ? current.emails.map(normEmail).filter(Boolean) : [];

  // 2) signup_approvals 로 profileId ↔ email 매핑 힌트 수집
  const { data: approvals, error: apErr } = await db
    .from('kcis_signup_approvals')
    .select('profile_id, email, nickname, provider');
  if (apErr) { console.warn('signup_approvals 조회 실패 (무시):', apErr.message); }
  const approvalMap = new Map(); // profileId -> { email, nickname, provider }
  for (const a of (approvals || [])) {
    if (a?.profile_id) {
      approvalMap.set(String(a.profile_id), {
        email: normEmail(a.email),
        nickname: a.nickname || '',
        provider: a.provider || '',
      });
    }
  }

  // 3) 엔티티 병합
  // email 을 기준으로 그룹핑. email 이 빈 profileId 는 standalone.
  const byEmail = new Map(); // email -> { profileIds:[], nicknames:[] }
  const orphanProfileIds = []; // email 없는 profileId

  for (const pid of legacyProfileIds) {
    const hint = approvalMap.get(pid);
    const em = normEmail(hint?.email);
    if (em) {
      if (!byEmail.has(em)) byEmail.set(em, { profileIds: [], nicknames: [] });
      byEmail.get(em).profileIds.push(pid);
      if (hint?.nickname) byEmail.get(em).nicknames.push(hint.nickname);
    } else {
      orphanProfileIds.push({ profileId: pid, hint });
    }
  }
  // legacy emails 도 같이 병합 (profileId 없는 email 만 관리자인 경우)
  for (const em of legacyEmails) {
    if (!byEmail.has(em)) byEmail.set(em, { profileIds: [], nicknames: [] });
  }

  // 4) 엔티티 배열 생성
  const now = new Date().toISOString();
  let seq = 1;
  const admins = [];
  for (const [em, g] of byEmail.entries()) {
    admins.push({
      id: `admin-${String(seq++).padStart(2, '0')}`,
      label: g.nicknames[0] || em.split('@')[0] || '(미지정)',
      email: em,
      profileIds: Array.from(new Set(g.profileIds)),
      role: 'system',
      addedAt: now,
      addedBy: null,
      notes: g.profileIds.length === 0 ? 'legacy email only' : '',
    });
  }
  for (const o of orphanProfileIds) {
    admins.push({
      id: `admin-${String(seq++).padStart(2, '0')}`,
      label: o.hint?.nickname || `(미지정) ${o.profileId}`,
      email: '',
      profileIds: [o.profileId],
      role: 'system',
      addedAt: now,
      addedBy: null,
      notes: 'legacy profileId, no email mapping',
    });
  }

  const nextValue = { admins };

  console.log('[마이그레이션 결과]');
  console.log(JSON.stringify(nextValue, null, 2));
  console.log();
  console.log(`엔티티 ${admins.length}개 (email 매핑 된 것 ${byEmail.size - legacyEmails.filter((e) => !byEmail.get(e)?.profileIds?.length).length}, 고아 profileId ${orphanProfileIds.length})`);

  if (!EXECUTE) {
    console.log('\n→ dry-run. 실제 저장하려면 --execute 플래그를 붙이세요.');
    return;
  }

  const { error: upErr } = await db
    .from(KV_TABLE)
    .upsert({ key: KV_KEY, value: nextValue }, { onConflict: 'key' });
  if (upErr) { console.error('저장 실패:', upErr.message); process.exit(1); }
  console.log('\n✓ 저장 완료.');
}

main().catch((e) => { console.error(e); process.exit(1); });
