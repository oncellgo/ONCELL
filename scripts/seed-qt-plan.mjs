// ---------------------------------------------------------------
// QT 연간 계획 시드 — 매일성경(sum.su.or.kr) AJAX API에서 연간 본문 범위 적재
//
// 사용:
//   dry-run:    node scripts/seed-qt-plan.mjs --year=2026
//   특정 날만:   node scripts/seed-qt-plan.mjs --date=2026-04-30
//   실행:       node scripts/seed-qt-plan.mjs --year=2026 --execute
//   재개:       node scripts/seed-qt-plan.mjs --year=2026 --resume --execute
//
// 동작:
// 1. 1월 1일 ~ 12월 31일 순회 (각 날짜)
// 2. AJAX_BIBLE_URL 에 POST {qt_ty:'A', Base_de:date}
// 3. 응답의 첫/마지막 verse로 reference 조립 (pages/api/qt.ts 와 동일 로직)
// 4. oncell_qt_plan 에 upsert (date PK)
// 5. 호출 사이 1.5s sleep (외부 사이트 부하 배려)
//
// 사전 준비:
//   Supabase SQL Editor 에 supabase-schema.sql 의 oncell_qt_plan 테이블 DDL 적용.
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
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// CLI 인자
const getArg = (name) => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const has = (flag) => process.argv.includes(flag);
const EXECUTE = has('--execute');
const RESUME = has('--resume');
const dateArg = getArg('date');
const yearArg = getArg('year');
const year = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear();
if (!dateArg && (!Number.isInteger(year) || year < 2020 || year > 2030)) {
  console.error('--year 필요 (2020-2030 범위)');
  process.exit(1);
}

const BOOK_CODE_NAMES = {
  1: '창세기', 2: '출애굽기', 3: '레위기', 4: '민수기', 5: '신명기',
  6: '여호수아', 7: '사사기', 8: '룻기',
  9: '사무엘상', 10: '사무엘하', 11: '열왕기상', 12: '열왕기하',
  13: '역대상', 14: '역대하', 15: '에스라', 16: '느헤미야', 17: '에스더',
  18: '욥기', 19: '시편', 20: '잠언', 21: '전도서', 22: '아가',
  23: '이사야', 24: '예레미야', 25: '예레미야애가', 26: '에스겔', 27: '다니엘',
  28: '호세아', 29: '요엘', 30: '아모스', 31: '오바댜', 32: '요나', 33: '미가',
  34: '나훔', 35: '하박국', 36: '스바냐', 37: '학개', 38: '스가랴', 39: '말라기',
  40: '마태복음', 41: '마가복음', 42: '누가복음', 43: '요한복음', 44: '사도행전',
  45: '로마서', 46: '고린도전서', 47: '고린도후서', 48: '갈라디아서', 49: '에베소서',
  50: '빌립보서', 51: '골로새서', 52: '데살로니가전서', 53: '데살로니가후서',
  54: '디모데전서', 55: '디모데후서', 56: '디도서', 57: '빌레몬서',
  58: '히브리서', 59: '야고보서', 60: '베드로전서', 61: '베드로후서',
  62: '요한일서', 63: '요한이서', 64: '요한삼서', 65: '유다서', 66: '요한계시록',
};

const AJAX_URL = 'https://sum.su.or.kr:8888/Ajax/Bible/BodyBible';

const fetchOne = async (date) => {
  const r = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Mozilla/5.0 (compatible; ONCELL-Seed/1.0)',
      Accept: 'application/json',
    },
    body: JSON.stringify({ qt_ty: 'A', Base_de: date }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const txt = await r.text();
  let rows;
  try {
    rows = JSON.parse(txt);
  } catch {
    throw new Error('Invalid JSON response');
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const bookCode = Number(first.Bible_Code);
  const bookName = BOOK_CODE_NAMES[bookCode];
  if (!bookName) return null;
  const sC = Number(first.Chapter), sV = Number(first.Verse);
  const eC = Number(last.Chapter), eV = Number(last.Verse);
  if (![sC, sV, eC, eV].every(Number.isFinite)) return null;
  const reference = sC === eC
    ? `${bookName} ${sC}:${sV}-${eV}`
    : `${bookName} ${sC}:${sV}-${eC}:${eV}`;
  return {
    date,
    book_code: bookCode,
    book_name: bookName,
    start_chapter: sC,
    start_verse: sV,
    end_chapter: eC,
    end_verse: eV,
    reference,
  };
};

const datesForYear = (year) => {
  const dates = [];
  let d = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  while (d <= end) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  return dates;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`[QT plan seed] year=${year} execute=${EXECUTE} resume=${RESUME}${dateArg ? ` date=${dateArg}` : ''}`);

  let dates = dateArg ? [dateArg] : datesForYear(year);

  if (RESUME && !dateArg) {
    const { data: existing, error } = await db
      .from('oncell_qt_plan')
      .select('date')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    if (error) {
      console.error('  resume 조회 실패:', error.message);
      process.exit(1);
    }
    const existingSet = new Set((existing || []).map((r) => r.date));
    const before = dates.length;
    dates = dates.filter((d) => !existingSet.has(d));
    console.log(`  resume: ${before} → ${dates.length} (이미 있는 ${before - dates.length}건 스킵)`);
  }

  let ok = 0, fail = 0, empty = 0;
  const samples = [];

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    try {
      const result = await fetchOne(d);
      if (!result) {
        empty++;
        if (i % 30 === 0) console.log(`  ${d}: (응답 없음)`);
      } else {
        if (samples.length < 6) samples.push(result);
        if (EXECUTE) {
          const { error } = await db
            .from('oncell_qt_plan')
            .upsert(result, { onConflict: 'date' });
          if (error) {
            console.error(`  ${d}: insert 실패 ${error.message}`);
            fail++;
            if (i < dates.length - 1) await sleep(1500);
            continue;
          }
        }
        ok++;
        if (i % 30 === 0 || dates.length < 10) console.log(`  ${d} → ${result.reference}`);
      }
    } catch (e) {
      console.error(`  ${d}: 호출 실패 ${e?.message || e}`);
      fail++;
    }
    if (i < dates.length - 1) await sleep(1500);
  }

  console.log(`\n총 ${dates.length}건: 성공 ${ok}, 빈 응답 ${empty}, 실패 ${fail}`);
  if (!EXECUTE) {
    console.log('\n  * dry-run 모드 — 실제 저장하려면 --execute');
    if (samples.length) {
      console.log('\n  샘플 (저장될 데이터):');
      samples.forEach((s) => console.log(`    ${s.date} → ${s.reference}`));
    }
  }
})();
