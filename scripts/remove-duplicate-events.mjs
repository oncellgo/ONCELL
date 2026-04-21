// ---------------------------------------------------------------
// 일괄입력 시 타임존 이슈로 동일 title 이벤트가 연속된 두 날짜에
// 들어간 경우, **늦은 날짜(다음날) 쪽**을 삭제한다.
//
// 판정 기준:
//   - type='event'
//   - 동일 title 쌍이 start_at 기준 24시간(= 1 day) 간격
//   - (start_at의 로컬 날짜가 하루 차이 — UTC 저장이면 string 비교로도 OK)
//
// 사용:
//   dry-run: node scripts/remove-duplicate-events.mjs
//   실행:    node scripts/remove-duplicate-events.mjs --execute
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
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const T = (n) => `kcis_${n}`;
const EXECUTE = process.argv.includes('--execute');

const DAY_MS = 24 * 60 * 60 * 1000;

const dateKeySG = (iso) => {
  // UTC+8(싱가폴) 로컬 날짜 키
  const d = new Date(iso);
  const sg = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return sg.toISOString().slice(0, 10);
};

const main = async () => {
  const { data: events, error } = await db
    .from(T('events'))
    .select('*')
    .order('title')
    .order('start_at');

  if (error) { console.error(error); process.exit(1); }
  console.log(`전체 로우: ${events.length}`);

  // 타입 분포
  const byType = {};
  for (const e of events) { byType[e.type || 'null'] = (byType[e.type || 'null'] || 0) + 1; }
  console.log('type 분포:', byType);

  // 유아세례문답 / 구역지도자 모임 그 자체로 얼마나 있는지
  const pickTitles = ['유아세례문답', '구역지도자모임 및 구역연합예배'];
  for (const t of pickTitles) {
    const rows = events.filter((e) => e.title === t);
    console.log(`\n"${t}" — ${rows.length}건:`);
    for (const r of rows) {
      console.log(`  id=${r.id}  type=${r.type}  start=${r.start_at}  end=${r.end_at}  rule=${JSON.stringify(r.rule)}`);
    }
  }

  // 같은 title 내에서 start_at 오름차순 pair 비교
  const byTitle = new Map();
  for (const e of events) {
    if (!byTitle.has(e.title)) byTitle.set(e.title, []);
    byTitle.get(e.title).push(e);
  }

  const toDelete = [];
  for (const [title, list] of byTitle) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const diff = new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
      // 23~25시간 범위 (타임존 보정 오차 허용)
      if (diff >= 23 * 60 * 60 * 1000 && diff <= 25 * 60 * 60 * 1000) {
        toDelete.push({ keep: a, drop: b });
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('\n✓ 중복(연속 두 날짜) 쌍 없음');
    return;
  }

  console.log(`\n중복 쌍 ${toDelete.length}건 발견 — 각 쌍의 "늦은 쪽"을 삭제 대상으로 표시\n`);
  console.log('KEEP (원본)                                            →  DROP (삭제)');
  console.log('─'.repeat(110));
  for (const { keep, drop } of toDelete) {
    const kd = dateKeySG(keep.start_at);
    const dd = dateKeySG(drop.start_at);
    console.log(`  ${kd}  ${String(keep.id).padEnd(30)} "${keep.title.slice(0, 24)}"`);
    console.log(`  ${dd}  ${String(drop.id).padEnd(30)} "${drop.title.slice(0, 24)}"  ← DROP`);
    console.log('');
  }

  if (!EXECUTE) {
    console.log('─'.repeat(110));
    console.log(`DRY RUN (기본값). 실제 삭제하려면 --execute 추가.`);
    return;
  }

  console.log('─'.repeat(110));
  console.log('\n삭제 실행 중…');
  const ids = toDelete.map((p) => p.drop.id);
  const { error: delErr, count } = await db.from(T('events')).delete({ count: 'exact' }).in('id', ids);
  if (delErr) {
    console.error('삭제 실패:', delErr);
    process.exit(1);
  }
  console.log(`✓ ${count ?? ids.length}건 삭제 완료`);
};

main().catch((e) => { console.error(e); process.exit(1); });
