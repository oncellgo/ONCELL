// ---------------------------------------------------------------
// worship_services 중 스케줄 일정을 events 테이블로 마이그레이션
// 사용:
//   dry-run: node scripts/migrate-worship-to-events.mjs
//   실행:    node scripts/migrate-worship-to-events.mjs --execute
//
// 대상: worship_services 행 중 is_default=false 이고 start_at 이 있는 것
// 생성: events row (type='event', scope='worship', id=`worship-{ws.id}`)
// 중복: 이미 같은 id 가진 events 행이 있으면 건너뜀
// 보존: worship_services 의 bulletin / 템플릿 데이터는 그대로 유지
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env 필요'); process.exit(1); }

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const T = (n) => `oncell_${n}`;
const EXECUTE = process.argv.includes('--execute');

const main = async () => {
  // 1) worship_services 전체
  const { data: wsAll, error: e1 } = await db.from(T('worship_services')).select('*');
  if (e1) throw e1;
  const services = wsAll || [];
  console.log(`[worship_services] 전체 ${services.length} 행`);

  // 2) 대상 필터: is_default 아니고 start_at 존재
  const candidates = services.filter((s) => !s.is_default && s.start_at);
  console.log(`[대상] is_default=false & start_at 있음 : ${candidates.length} 행`);

  // 3) 이미 존재하는 events 확인 (id = `worship-${ws.id}`)
  const targetIds = candidates.map((s) => `worship-${s.id}`);
  let existing = [];
  if (targetIds.length > 0) {
    const { data: ex, error: e2 } = await db.from(T('events')).select('id').in('id', targetIds);
    if (e2) throw e2;
    existing = ex || [];
  }
  const existingSet = new Set(existing.map((r) => r.id));
  const toInsert = candidates.filter((s) => !existingSet.has(`worship-${s.id}`));

  console.log(`[기존 events 매핑 있음] ${existingSet.size} 건 (skip)`);
  console.log(`[신규 생성 예정] ${toInsert.length} 건`);

  if (toInsert.length > 0) {
    console.log('\n샘플 5건:');
    toInsert.slice(0, 5).forEach((s) => {
      console.log(`  - ${s.name} @ ${s.start_at}  (community=${s.community_id}, wsId=${s.id})`);
    });
  }

  if (!EXECUTE) {
    console.log('\n→ dry-run. 실제 적용하려면: node scripts/migrate-worship-to-events.mjs --execute');
    return;
  }

  if (toInsert.length === 0) { console.log('\n삽입할 행이 없어 종료.'); return; }

  // 4) 삽입 — events 테이블 스키마에 맞춰 snake_case
  const now = new Date().toISOString();
  const rows = toInsert.map((s) => {
    const startTs = new Date(s.start_at).getTime();
    const endIso = isFinite(startTs) ? new Date(startTs + 60 * 60 * 1000).toISOString() : s.start_at;
    return {
      id: `worship-${s.id}`,
      community_id: s.community_id,
      title: s.name || '예배',
      start_at: s.start_at,
      end_at: endIso,
      created_by: s.created_by || 'migration',
      created_at: s.created_at || now,
      scope: 'worship',
      type: 'event',
      category: '일반예배',
    };
  });

  // 청크로 안전 삽입
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await db.from(T('events')).insert(chunk);
    if (error) {
      console.error(`  chunk ${i}~${i + chunk.length} 실패: ${error.message}`);
      continue;
    }
    inserted += chunk.length;
  }
  console.log(`\n✓ events 테이블에 ${inserted} 행 삽입 완료.`);
  console.log('※ worship_services 는 변경하지 않았습니다 (bulletin 보존).');
};

main().catch((e) => { console.error('\n✗ 오류:', e); process.exit(1); });
