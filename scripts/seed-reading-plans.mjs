// ---------------------------------------------------------------
// 성경통독 계획 시드 스크립트 — oncell_reading_plans 테이블에 날짜별 범위 적재
//
// 사용:
//   dry-run:     node scripts/seed-reading-plans.mjs --year=2026 --plan=1
//   실행:        node scripts/seed-reading-plans.mjs --year=2026 --plan=1 --execute
//   양쪽 동시:   node scripts/seed-reading-plans.mjs --year=2026 --plan=all --execute
//
// 로직:
//   1. BOOKS × plan 배수로 평면화 (1189장 × plan) — 총 읽을 장 수
//   2. 연중 일수 (365 or 366) 로 균등 분배 (lib/readingPlan.ts planForDate 와 동일 로직)
//   3. 같은 book 연속 장은 range 로 묶음
//   4. upsert to oncell_reading_plans (plan, date) — 재실행 안전
// ---------------------------------------------------------------
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드
const envPath = path.resolve('.env.local');
if (existsSync(envPath)) {
  for (const l of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env 필요'); process.exit(1); }

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const EXECUTE = process.argv.includes('--execute');

// ── CLI 인자 ────────────────────────────────────────────────────
const getArg = (name) => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const year = parseInt(getArg('year') || String(new Date().getFullYear()), 10);
const planArg = (getArg('plan') || '1').toLowerCase();
const plans = planArg === 'all' ? [1, 2] : [parseInt(planArg, 10)];
if (!Number.isFinite(year) || year < 2020 || year > 2100) {
  console.error('year 유효 범위: 2020-2100');
  process.exit(1);
}
for (const p of plans) {
  if (!Number.isInteger(p) || p < 1) {
    console.error(`plan 은 정수 (1,2,... or "all"). 받은 값: ${planArg}`);
    process.exit(1);
  }
}

// ── 성경 구조 (lib/readingPlan.ts 와 동일) ──────────────────────
const BOOKS = [
  ['창세기', 50], ['출애굽기', 40], ['레위기', 27], ['민수기', 36], ['신명기', 34],
  ['여호수아', 24], ['사사기', 21], ['룻기', 4], ['사무엘상', 31], ['사무엘하', 24],
  ['열왕기상', 22], ['열왕기하', 25], ['역대상', 29], ['역대하', 36], ['에스라', 10],
  ['느헤미야', 13], ['에스더', 10], ['욥기', 42], ['시편', 150], ['잠언', 31],
  ['전도서', 12], ['아가', 8], ['이사야', 66], ['예레미야', 52], ['예레미야애가', 5],
  ['에스겔', 48], ['다니엘', 12], ['호세아', 14], ['요엘', 3], ['아모스', 9],
  ['오바댜', 1], ['요나', 4], ['미가', 7], ['나훔', 3], ['하박국', 3],
  ['스바냐', 3], ['학개', 2], ['스가랴', 14], ['말라기', 4],
  ['마태복음', 28], ['마가복음', 16], ['누가복음', 24], ['요한복음', 21], ['사도행전', 28],
  ['로마서', 16], ['고린도전서', 16], ['고린도후서', 13], ['갈라디아서', 6], ['에베소서', 6],
  ['빌립보서', 4], ['골로새서', 4], ['데살로니가전서', 5], ['데살로니가후서', 3],
  ['디모데전서', 6], ['디모데후서', 4], ['디도서', 3], ['빌레몬서', 1],
  ['히브리서', 13], ['야고보서', 5], ['베드로전서', 5], ['베드로후서', 3],
  ['요한일서', 5], ['요한이서', 1], ['요한삼서', 1], ['유다서', 1], ['요한계시록', 22],
];

const FLAT_SINGLE = [];
for (const [book, count] of BOOKS) {
  for (let c = 1; c <= count; c++) FLAT_SINGLE.push({ book, chapter: c });
}
if (FLAT_SINGLE.length !== 1189) {
  console.error(`[sanity] FLAT length ${FLAT_SINGLE.length} ≠ 1189`);
  process.exit(1);
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = (y) => (isLeap(y) ? 366 : 365);
const pad2 = (n) => String(n).padStart(2, '0');

const dateKey = (y, dayIdx) => {
  // dayIdx 0-based: 0 = 1월 1일
  const d = new Date(Date.UTC(y, 0, 1 + dayIdx));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

// ── 플랜별 일일 범위 생성 ──────────────────────────────────────
const buildRows = (plan) => {
  const flat = [];
  for (let i = 0; i < plan; i++) flat.push(...FLAT_SINGLE);
  const total = flat.length;
  const nDays = daysInYear(year);
  const rows = [];
  for (let i = 0; i < nDays; i++) {
    const startIdx = Math.floor((i * total) / nDays);
    const endIdx = Math.floor(((i + 1) * total) / nDays);
    const slice = flat.slice(startIdx, endIdx);
    const ranges = [];
    for (const item of slice) {
      const last = ranges[ranges.length - 1];
      if (last && last.book === item.book && last.endCh + 1 === item.chapter) {
        last.endCh = item.chapter;
      } else {
        ranges.push({ book: item.book, startCh: item.chapter, endCh: item.chapter });
      }
    }
    rows.push({ plan, date: dateKey(year, i), ranges });
  }
  return rows;
};

// ── 샘플 미리보기 ──────────────────────────────────────────────
const preview = (rows) => {
  const fmt = (r) => r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;
  const samples = [0, 30, 100, 180, 270, rows.length - 1];
  for (const i of samples) {
    if (i >= rows.length) continue;
    const r = rows[i];
    const label = r.ranges.map(fmt).join(' · ');
    console.log(`    [${r.date}] ${label}`);
  }
};

// ── 실행 ──────────────────────────────────────────────────────
const main = async () => {
  console.log(`\n=== 성경통독 계획 시드 ===`);
  console.log(`year:    ${year} (${isLeap(year) ? '윤년 366일' : '평년 365일'})`);
  console.log(`plans:   ${plans.join(', ')}`);
  console.log(`mode:    ${EXECUTE ? 'EXECUTE' : 'dry-run'}`);
  console.log();

  for (const plan of plans) {
    const rows = buildRows(plan);
    const totalChapters = rows.reduce((sum, r) => sum + r.ranges.reduce((s, rng) => s + (rng.endCh - rng.startCh + 1), 0), 0);
    const avgPerDay = (totalChapters / rows.length).toFixed(2);
    console.log(`─ plan=${plan} (${plan === 1 ? '1년 1독' : plan === 2 ? '1년 2독' : `1년 ${plan}독`}) `.padEnd(60, '─'));
    console.log(`  일수: ${rows.length} · 총 장수: ${totalChapters} · 하루 평균: ${avgPerDay}장`);
    console.log(`  샘플 6개:`);
    preview(rows);

    if (!EXECUTE) {
      console.log(`  → dry-run — Supabase 쓰기 skip`);
      continue;
    }

    // upsert in batches of 100
    const BATCH = 100;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await db.from('oncell_reading_plans').upsert(chunk, { onConflict: 'plan,date' });
      if (error) {
        console.error(`  ✗ batch ${i}-${i + chunk.length} 실패:`, error.message);
        process.exit(1);
      }
      upserted += chunk.length;
    }
    console.log(`  ✓ upsert 완료: ${upserted} rows`);
  }

  console.log();
  if (!EXECUTE) {
    console.log(`dry-run 종료. 실제 적재: --execute 추가`);
  } else {
    console.log(`시드 완료.`);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
