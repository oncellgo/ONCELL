// ---------------------------------------------------------------
// Supabase 전체 데이터 로컬 백업
// 사용:
//   node scripts/backup-supabase.mjs                    # 기본: backups/<타임스탬프>/ 에 저장
//   node scripts/backup-supabase.mjs --out ./mybackup   # 출력 경로 지정
//   node scripts/backup-supabase.mjs --keep 10          # 최근 10개만 남기고 이전 백업 삭제
//   node scripts/backup-supabase.mjs --pretty           # JSON 들여쓰기(용량↑, 가독성↑)
//
// 산출물 (backups/2026-04-23T12-00-00/):
//   manifest.json                 # 메타정보 + 테이블별 행수
//   oncell_communities.json
//   oncell_profiles.json
//   oncell_users.json
//   oncell_events.json
//   oncell_worship_services.json
//   oncell_venues.json
//   oncell_floors.json
//   oncell_venue_blocks.json
//   oncell_venue_block_groups.json
//   oncell_community_bulletin_templates.json
//   oncell_signup_approvals.json
//   oncell_qt_notes.json
//   oncell_event_categories.json
//   oncell_app_kv.json              # settings / system_admins / worship_templates 전부 포함
//
// 주의: 개인정보(프로필/이메일/연락처)가 들어있으므로 backups/ 는 .gitignore 에 등록됨.
// ---------------------------------------------------------------
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- .env.local 로드 -----------------------------------------------------
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
  console.error('✗ 환경변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// --- 옵션 파싱 -----------------------------------------------------------
const argv = process.argv.slice(2);
const getArg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const PRETTY   = argv.includes('--pretty');
const KEEP     = Number(getArg('--keep')) || 0;     // 0 = 보존 제한 없음
const OUT_BASE = getArg('--out') || 'backups';

// --- 백업 대상 테이블 (lib/db.ts 의 T 와 동기화) ----------------------------
const TABLES = [
  'oncell_communities',
  'oncell_profiles',
  'oncell_users',
  'oncell_events',
  'oncell_worship_services',
  'oncell_venues',
  'oncell_floors',
  'oncell_venue_blocks',
  'oncell_venue_block_groups',
  'oncell_community_bulletin_templates',
  'oncell_signup_approvals',
  'oncell_qt_notes',
  'oncell_event_categories',
  'oncell_app_kv',
];

const PAGE = 1000; // Supabase select 기본 상한

// 페이지네이션으로 전체 행을 긁어옴
const fetchAllRows = async (table) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await db.from(table).select('*').range(from, to);
    if (error) throw new Error(`[${table}] select range ${from}-${to} 실패: ${error.message}`);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
};

// --- 출력 디렉터리 ------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
const outDir = path.resolve(OUT_BASE, stamp);
mkdirSync(outDir, { recursive: true });

const writeJson = (file, data) => {
  writeFileSync(path.join(outDir, file), JSON.stringify(data, null, PRETTY ? 2 : 0), 'utf8');
};

const main = async () => {
  console.log(`[backup] target: ${new URL(SUPABASE_URL).host}`);
  console.log(`[backup] out:    ${outDir}\n`);

  const startedAt = Date.now();
  const summary = [];
  let totalRows = 0;

  for (const t of TABLES) {
    const tStart = Date.now();
    try {
      const rows = await fetchAllRows(t);
      writeJson(`${t}.json`, rows);
      const ms = Date.now() - tStart;
      totalRows += rows.length;
      summary.push({ table: t, rows: rows.length, ms });
      console.log(`  ✓ ${t.padEnd(38)} ${String(rows.length).padStart(6)} rows  (${ms}ms)`);
    } catch (e) {
      summary.push({ table: t, rows: 0, ms: Date.now() - tStart, error: e.message });
      console.error(`  ✗ ${t}: ${e.message}`);
    }
  }

  const manifest = {
    backupAt: new Date().toISOString(),
    supabaseHost: new URL(SUPABASE_URL).host,
    durationMs: Date.now() - startedAt,
    totalRows,
    tables: summary,
  };
  writeJson('manifest.json', manifest);

  console.log(`\n[backup] total ${totalRows} rows in ${manifest.durationMs}ms → ${outDir}`);

  // --- 보존 정책 ---------------------------------------------------------
  if (KEEP > 0) {
    const base = path.resolve(OUT_BASE);
    const dirs = readdirSync(base)
      .map((name) => ({ name, full: path.join(base, name) }))
      .filter((d) => {
        try { return statSync(d.full).isDirectory(); } catch { return false; }
      })
      .sort((a, b) => (a.name < b.name ? 1 : -1)); // 최신 먼저
    const toPrune = dirs.slice(KEEP);
    for (const d of toPrune) {
      rmSync(d.full, { recursive: true, force: true });
      console.log(`[prune] 삭제: ${d.full}`);
    }
    if (toPrune.length === 0) {
      console.log(`[prune] keep=${KEEP}, 현재 ${dirs.length}개 — 삭제 없음.`);
    }
  }
};

main().catch((e) => { console.error('\n✗ 백업 실패:', e); process.exit(1); });
