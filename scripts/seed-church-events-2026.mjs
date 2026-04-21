// ---------------------------------------------------------------
// 2026 교회 행사 일괄 등록 스크립트 (월별 누적 방식)
// 사용:
//   dry-run: node scripts/seed-church-events-2026.mjs
//   실행:    node scripts/seed-church-events-2026.mjs --execute
//
// 규칙
//  - [주일] + [행사] 컬럼만 반영 (교회력/절기·주일예배·새벽담당 제외)
//  - '구역모임 시작'·'구역모임 방학' 등 장기 이벤트 제외
//  - 모든 이벤트 = **종일(all-day)** — start_at 00:00, end_at 23:59 (+08:00)
//  - 연속 다일행사(예: 1/5~1/9 5일)는 `days` 로 표기 → daily rule 반복으로 저장
//  - id prefix `plan2026-` 고정 (upsert로 재실행 안전)
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env 필요'); process.exit(1); }

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const T = (n) => `kcis_${n}`;
const EXECUTE = process.argv.includes('--execute');

// 관리자 profileId (created_by로 기록)
const ADMIN_PROFILE_ID = 'kakao-4841830358';

// ===== 월별 이벤트 정의 =====
// {date, title}            → 종일 1건
// {date, title, days: N}   → date부터 N일 daily rule
const EVENTS = [
  // ===== 2026년 1월 =====
  { date: '2026-01-04', title: '신년주일/주현절' },            // 교회력
  { date: '2026-01-04', title: '성찬식' },                     // 주일
  { date: '2026-01-04', title: '신년예배' },                   // 행사
  { date: '2026-01-04', title: '제직회' },                     // 행사
  { date: '2026-01-05', title: '신년 전교인새벽기도회', days: 5 },  // 1/5 ~ 1/9
  { date: '2026-01-11', title: '주님수세주일' },               // 교회력
  { date: '2026-01-11', title: '제직수련회 및 위원회별 상견례' },
  { date: '2026-01-16', title: '구역지도자 수련회 및 구역연합예배' },
  { date: '2026-01-16', title: '구역모임 시작' },              // 시작일 마커 (원장: 1/16~6/5)
  { date: '2026-01-18', title: '여전도회주일' },               // 교회력
  { date: '2026-01-18', title: '공동의회/당회' },

  // ===== 2026년 2월 =====
  { date: '2026-02-06', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-02-11', title: '큐티세미나', rule: { freq: 'weekly', interval: 1, count: 2 } },  // 2/11, 2/18
  { date: '2026-02-13', title: '유치원 졸업식' },
  { date: '2026-02-15', title: '산상변모주일' },
  { date: '2026-02-15', title: '당회' },
  { date: '2026-02-18', title: '재의수요일' },
  { date: '2026-02-22', title: '사순절1' },
  { date: '2026-02-25', title: '성경대학 개강' },

  // ===== 2026년 3월 =====
  { date: '2026-03-01', title: '사순절2' },
  { date: '2026-03-01', title: '성찬식' },
  { date: '2026-03-06', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-03-07', title: '입교세례교육', rule: { freq: 'weekly', interval: 1, count: 4 } }, // 3/7, 3/14, 3/21, 3/28
  { date: '2026-03-08', title: '사순절3' },
  { date: '2026-03-15', title: '사순절4' },
  { date: '2026-03-22', title: '사순절5' },
  { date: '2026-03-23', title: '당회' },
  { date: '2026-03-29', title: '종려주일/고난주간' },
  { date: '2026-03-29', title: '제직회' },
  { date: '2026-03-30', title: '고난주간새벽기도회', days: 5 },  // 3/30~4/3
  { date: '2026-04-03', title: '성금요일' },
  { date: '2026-04-03', title: '성금요연합예배' },
  { date: '2026-04-04', title: '입교세례문답' },

  // ===== 2026년 4월 =====
  { date: '2026-04-05', title: '부활주일' },
  { date: '2026-04-05', title: '세례 입교식 1부' },
  { date: '2026-04-10', title: '구역지도자 수련회' },
  { date: '2026-04-14', title: '전교인 성경통독수련회 1차', days: 4 },  // 4/14~4/17
  { date: '2026-04-19', title: '장애인주일' },
  { date: '2026-04-20', title: '당회' },
  { date: '2026-04-26', title: '유아세례문답' },
  { date: '2026-05-01', title: '구역지도자모임 및 구역연합예배' },

  // ===== 2026년 5월 =====
  { date: '2026-05-03', title: '어린이주일' },
  { date: '2026-05-03', title: '유아세례식 2부' },
  { date: '2026-05-10', title: '어버이주일' },
  { date: '2026-05-10', title: '성찬식' },
  { date: '2026-05-10', title: '온세대 연합예배 2부' },
  { date: '2026-05-15', title: '온가족 지역별 성경퀴즈대회' },
  { date: '2026-05-20', title: '성경대학 종강' },
  { date: '2026-05-24', title: '성령강림주일' },
  { date: '2026-05-25', title: '당회' },
  { date: '2026-05-31', title: '삼위일체주일' },
  { date: '2026-05-31', title: '제직회' },
  { date: '2026-06-05', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-06-05', title: '구역모임 방학' },               // 시작일 마커

  // ===== 2026년 6월 =====
  { date: '2026-06-14', title: '군선교주일' },
  { date: '2026-06-21', title: '북한선교주일' },
  { date: '2026-06-22', title: '당회' },

  // ===== 2026년 7월 =====
  { date: '2026-07-05', title: '맥추감사주일' },
  { date: '2026-07-05', title: '성찬식' },
  { date: '2026-07-19', title: '당회' },
  { date: '2026-07-26', title: '제직회' },

  // ===== 2026년 8월 =====
  { date: '2026-08-02', title: '이단경계주일' },
  { date: '2026-08-02', title: '창립기념주일 (46주년)' },
  { date: '2026-08-07', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-08-07', title: '구역모임 시작' },               // 시작일 마커
  { date: '2026-08-09', title: '나라를 위한 기도주일' },
  { date: '2026-08-23', title: '당회' },

  // ===== 2026년 9월 =====
  { date: '2026-09-01', title: '전교인 통독수련회 2차', days: 4 },  // 9/1~9/4
  { date: '2026-09-06', title: '총회주일/교회학교교사주일' },
  { date: '2026-09-06', title: '성찬식' },
  { date: '2026-09-09', title: '성경대학 개강' },
  { date: '2026-09-11', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-09-20', title: '당회' },
  { date: '2026-09-26', title: '입교세례교육', rule: { freq: 'weekly', interval: 1, count: 4 } }, // 9/26~10/17
  { date: '2026-09-27', title: '제직회' },
  { date: '2026-10-02', title: '구역지도자모임 및 구역연합예배' },

  // ===== 2026년 10월 =====
  { date: '2026-10-18', title: '당회' },
  { date: '2026-10-24', title: '세례입교문답' },
  { date: '2026-10-25', title: '종교개혁기념주일' },
  { date: '2026-10-25', title: '세례 입교식' },
  { date: '2026-10-25', title: '서리집사 추천' },

  // ===== 2026년 11월 =====
  { date: '2026-11-01', title: '성찬식' },
  { date: '2026-11-02', title: '기획당회', days: 2 },           // 11/2~11/3
  { date: '2026-11-06', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-11-15', title: '추수감사주일' },
  { date: '2026-11-20', title: '기관별 감사찬양대회' },
  { date: '2026-11-22', title: '왕이신 그리스도 주일' },
  { date: '2026-11-22', title: '당회' },
  { date: '2026-11-22', title: '신임서리집사교육' },
  { date: '2026-11-24', title: '연말연시 전교인 저녁기도회', days: 4 },  // 11/24~11/27
  { date: '2026-11-25', title: '성경대학 종강' },
  { date: '2026-11-29', title: '대림절1' },
  { date: '2026-11-29', title: '제직회' },

  // ===== 2026년 12월 =====
  { date: '2026-12-04', title: '구역지도자모임 및 구역연합예배' },
  { date: '2026-12-04', title: '구역모임 방학' },               // 시작일 마커
  { date: '2026-12-06', title: '대림절2' },
  { date: '2026-12-13', title: '대림절3' },
  { date: '2026-12-13', title: '성서주일' },
  { date: '2026-12-18', title: '영광과 평화의 밤' },
  { date: '2026-12-20', title: '대림절4' },
  { date: '2026-12-20', title: '당회' },
  { date: '2026-12-20', title: '유아세례문답' },
  { date: '2026-12-25', title: '성탄절' },
  { date: '2026-12-25', title: '유아세례 2부' },
  { date: '2026-12-27', title: '제직회' },
  { date: '2026-12-31', title: '송구영신예배' },
];

const isoDate = (dateKey, h, m) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateKey}T${pad(h)}:${pad(m)}:00+08:00`;
};

const toEventRow = (e, idx) => {
  const startAt = isoDate(e.date, 0, 0);
  const endAt = isoDate(e.date, 23, 59);
  const slug = e.title.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 20);
  const id = `plan2026-${e.date}-${String(idx).padStart(2, '0')}-${slug}`;
  return {
    id,
    community_id: 'kcis',
    title: e.title,
    start_at: startAt,
    end_at: endAt,
    created_by: ADMIN_PROFILE_ID,
    created_at: new Date().toISOString(),
    scope: 'community',
    type: 'event',
    category: '행사',
    rule: e.days && e.days > 1 ? { freq: 'daily', interval: 1, count: e.days } : null,
  };
};

const main = async () => {
  const rows = EVENTS.map((e, i) => toEventRow(e, i + 1));
  const ids = rows.map((r) => r.id);
  const { data: existing } = await db.from(T('events')).select('id').in('id', ids);
  const existingIds = new Set((existing || []).map((r) => r.id));

  console.log(`[대상 이벤트] ${rows.length}건 (종일)`);
  rows.forEach((r) => {
    const mark = existingIds.has(r.id) ? '🔄' : '➕';
    const recur = r.rule ? ` [daily ×${r.rule.count}]` : '';
    console.log(`  ${mark} ${r.start_at.slice(0, 10)}  ${r.title}${recur}`);
  });
  console.log(`  (🔄 덮어쓰기 ${existingIds.size}건 / ➕ 신규 ${rows.length - existingIds.size}건)`);

  if (!EXECUTE) {
    console.log('\n→ dry-run. 실제 삽입하려면: node scripts/seed-church-events-2026.mjs --execute');
    return;
  }

  console.log('\n=== 실행: upsert ===');
  const { error } = await db.from(T('events')).upsert(rows, { onConflict: 'id' });
  if (error) { console.error('✗', error.message); process.exit(1); }
  console.log(`✓ ${rows.length}건 upsert 완료`);
};

main().catch((e) => { console.error(e); process.exit(1); });
