// ---------------------------------------------------------------
// 2026년 교회일정(oncell_events type='event') + 예배일정(oncell_worship_services) 전체 삭제.
//
// 삭제 대상:
//   - oncell_events  where type='event' AND start_at >= 2026-01-01 AND start_at < 2027-01-01
//   - oncell_worship_services (전체)
//
// 남기는 것:
//   - oncell_events 의 type='reservation' (사용자 예약)
//   - venue_blocks, 사용자, 프로필 등 다른 테이블 전부
//
// 사용:
//   dry-run: node scripts/wipe-2026-events.mjs
//   실행:    node scripts/wipe-2026-events.mjs --execute
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
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const EXECUTE = process.argv.includes('--execute');

const YEAR_FROM = '2026-01-01';
const YEAR_TO = '2027-01-01';

const main = async () => {
  // 1) 2026 교회일정 조회
  const { data: events, error: evErr } = await db
    .from('oncell_events')
    .select('id, title, start_at, type')
    .eq('type', 'event')
    .gte('start_at', YEAR_FROM)
    .lt('start_at', YEAR_TO)
    .order('start_at');
  if (evErr) { console.error('이벤트 조회 실패:', evErr); process.exit(1); }

  // 2) 모든 예배일정 조회
  const { data: worships, error: wsErr } = await db
    .from('oncell_worship_services')
    .select('id, name, community_id');
  if (wsErr) { console.error('예배일정 조회 실패:', wsErr); process.exit(1); }

  console.log(`\n== 삭제 대상 ==`);
  console.log(`교회일정(2026): ${events.length}건`);
  console.log(`예배일정(전체): ${worships.length}건`);

  if (events.length > 0) {
    console.log(`\n[교회일정 샘플 최대 10건]`);
    for (const e of events.slice(0, 10)) {
      console.log(`  ${e.start_at.slice(0, 10)}  ${String(e.id).padEnd(40)}  "${e.title}"`);
    }
    if (events.length > 10) console.log(`  ... +${events.length - 10}건`);
  }

  if (worships.length > 0) {
    console.log(`\n[예배일정 전체]`);
    for (const w of worships) {
      console.log(`  ${String(w.id).padEnd(40)}  community=${w.community_id}  "${w.name}"`);
    }
  }

  if (events.length === 0 && worships.length === 0) {
    console.log(`\n✓ 삭제할 것이 없습니다.`);
    return;
  }

  if (!EXECUTE) {
    console.log(`\n─────────────────────────────────────────`);
    console.log(`DRY RUN (기본값). 실제 삭제하려면 --execute 추가.`);
    return;
  }

  console.log(`\n삭제 실행 중…`);

  if (events.length > 0) {
    const { error, count } = await db
      .from('oncell_events')
      .delete({ count: 'exact' })
      .eq('type', 'event')
      .gte('start_at', YEAR_FROM)
      .lt('start_at', YEAR_TO);
    if (error) { console.error('교회일정 삭제 실패:', error); process.exit(1); }
    console.log(`✓ 교회일정 ${count ?? events.length}건 삭제`);
  }

  if (worships.length > 0) {
    const ids = worships.map((w) => w.id);
    const { error, count } = await db
      .from('oncell_worship_services')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) { console.error('예배일정 삭제 실패:', error); process.exit(1); }
    console.log(`✓ 예배일정 ${count ?? worships.length}건 삭제`);
  }

  console.log(`\n완료.`);
};

main().catch((e) => { console.error(e); process.exit(1); });
