// ---------------------------------------------------------------
// Supabase 백업 복원 (backup-supabase.mjs 로 만든 JSON 묶음을 DB 로 되돌림)
//
// 사용:
//   dry-run (기본):  node scripts/restore-supabase.mjs backups/2026-04-23T12-00-00
//   실제실행:         node scripts/restore-supabase.mjs backups/2026-04-23T12-00-00 --execute
//
// 선택 옵션:
//   --tables events,profiles        # 특정 테이블만 복원 (prefix oncell_ 생략 가능)
//   --mode upsert   (기본)          # 충돌 시 덮어쓰기, 백업에 없는 기존 행은 유지
//   --mode replace                  # 백업에 없는 기존 행도 삭제 (dataStore.replaceAll 과 동일)
//
// 주의:
//   - --mode replace 는 파괴적. 관리자 프로필/시스템 설정까지 사라질 수 있음.
//     app_kv 복원 시 system_admins 값이 덮어써지면 로그인 불가 상태가 될 수 있으니
//     실행 전 manifest 의 backupAt 과 지금 DB 상태를 비교할 것.
//   - 스키마 변경이 있었던 백업은 복원이 실패할 수 있음 (컬럼 불일치).
// ---------------------------------------------------------------
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- .env.local 로드 ---
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

// --- 옵션 파싱 ---
const argv = process.argv.slice(2);
const getArg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const EXECUTE = argv.includes('--execute');
const MODE    = (getArg('--mode') || 'upsert').toLowerCase();
if (!['upsert', 'replace'].includes(MODE)) {
  console.error(`✗ --mode 는 upsert | replace 중 하나여야 합니다. (받은 값: ${MODE})`);
  process.exit(1);
}
const TABLE_FILTER = (getArg('--tables') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((t) => (t.startsWith('oncell_') ? t : `oncell_${t}`));

const backupDir = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--tables' && argv[argv.indexOf(a) - 1] !== '--mode');
if (!backupDir) {
  console.error('✗ 백업 디렉터리 경로가 필요합니다.\n  예) node scripts/restore-supabase.mjs backups/2026-04-23T12-00-00');
  process.exit(1);
}
const absBackup = path.resolve(backupDir);
if (!existsSync(absBackup) || !statSync(absBackup).isDirectory()) {
  console.error(`✗ 디렉터리가 없습니다: ${absBackup}`);
  process.exit(1);
}

// --- 테이블별 PK (lib/dataStore.ts 와 동기화) ---
const TABLE_PK = {
  oncell_communities:                   'id',
  oncell_profiles:                      'profile_id',
  oncell_users:                         'provider_profile_id',
  oncell_events:                        'id',
  oncell_worship_services:              'id',
  oncell_venues:                        'id',
  oncell_floors:                        'name',
  oncell_venue_blocks:                  'id',
  oncell_venue_block_groups:            'id',
  oncell_community_bulletin_templates:  'community_id',
  oncell_signup_approvals:              'profile_id',
  oncell_qt_notes:                      ['profile_id', 'date'],
  oncell_event_categories:              'name',
  oncell_app_kv:                        'key',
};

// --- 유틸 ---
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const pkCols = (pk) => (Array.isArray(pk) ? pk : [pk]);
const rowKey = (row, pk) => pkCols(pk).map((c) => row[c]).join('|');

const upsertInChunks = async (table, rows, pk) => {
  if (rows.length === 0) return 0;
  const onConflict = Array.isArray(pk) ? pk.join(',') : pk;
  let ok = 0;
  for (const c of chunk(rows, 500)) {
    const { error } = await db.from(table).upsert(c, { onConflict });
    if (error) {
      console.error(`  ✗ ${table} upsert chunk 실패: ${error.message}`);
      continue;
    }
    ok += c.length;
  }
  return ok;
};

const deleteByKeys = async (table, keys, pk) => {
  if (keys.length === 0) return 0;
  let removed = 0;
  const cols = pkCols(pk);
  if (cols.length === 1) {
    for (const c of chunk(keys.map((k) => k[cols[0]]), 100)) {
      const { error } = await db.from(table).delete().in(cols[0], c);
      if (error) { console.error(`  ✗ ${table} delete chunk 실패: ${error.message}`); continue; }
      removed += c.length;
    }
  } else {
    // composite PK — 한 행씩 (oncell_qt_notes 만 해당)
    for (const k of keys) {
      let q = db.from(table).delete();
      for (const c of cols) q = q.eq(c, k[c]);
      const { error } = await q;
      if (error) { console.error(`  ✗ ${table} delete 실패: ${error.message}`); continue; }
      removed += 1;
    }
  }
  return removed;
};

const main = async () => {
  // 1) manifest 확인
  const manifestPath = path.join(absBackup, 'manifest.json');
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    console.log(`[manifest] backupAt: ${m.backupAt}`);
    console.log(`[manifest] host:     ${m.supabaseHost}`);
    console.log(`[manifest] totalRows: ${m.totalRows}`);
    const currentHost = new URL(SUPABASE_URL).host;
    if (m.supabaseHost && m.supabaseHost !== currentHost) {
      console.warn(`  ⚠ 백업 host (${m.supabaseHost}) 와 현재 대상 host (${currentHost}) 가 다릅니다.`);
    }
  } else {
    console.warn('[manifest] manifest.json 이 없습니다. 파일 목록으로만 진행합니다.');
  }
  console.log(`[restore] mode:   ${MODE} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}`);
  console.log(`[restore] source: ${absBackup}\n`);

  // 2) 복원 대상 테이블 결정
  const files = readdirSync(absBackup).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  const tables = files
    .map((f) => f.replace(/\.json$/, ''))
    .filter((t) => TABLE_PK[t])
    .filter((t) => TABLE_FILTER.length === 0 || TABLE_FILTER.includes(t));

  if (tables.length === 0) {
    console.error('✗ 복원할 테이블이 없습니다. (--tables 필터 확인)');
    process.exit(1);
  }

  // 3) plan 출력
  const plans = [];
  for (const t of tables) {
    const rows = JSON.parse(readFileSync(path.join(absBackup, `${t}.json`), 'utf8'));
    const pk = TABLE_PK[t];
    let willDelete = 0;
    if (MODE === 'replace') {
      // 현재 존재하는 PK 조회
      const selectCols = pkCols(pk).join(',');
      const { data: existing, error } = await db.from(t).select(selectCols);
      if (error) throw new Error(`[${t}] 기존 행 조회 실패: ${error.message}`);
      const incomingSet = new Set(rows.map((r) => rowKey(r, pk)));
      const toDelete = (existing || []).filter((r) => !incomingSet.has(rowKey(r, pk)));
      willDelete = toDelete.length;
      plans.push({ table: t, pk, rows, toDelete });
    } else {
      plans.push({ table: t, pk, rows, toDelete: [] });
    }
    console.log(`  • ${t.padEnd(38)} upsert ${String(rows.length).padStart(6)}  delete ${String(willDelete).padStart(6)}`);
  }

  if (!EXECUTE) {
    console.log('\n→ dry-run (--execute 플래그 없음). 실제 적용:');
    const cmd = [
      'node scripts/restore-supabase.mjs',
      backupDir,
      '--execute',
      `--mode ${MODE}`,
      TABLE_FILTER.length ? `--tables ${TABLE_FILTER.map((t) => t.replace(/^oncell_/, '')).join(',')}` : '',
    ].filter(Boolean).join(' ');
    console.log(`  ${cmd}`);
    return;
  }

  // 4) 실제 실행
  console.log('\n=== 복원 실행 ===');
  for (const p of plans) {
    const upserted = await upsertInChunks(p.table, p.rows, p.pk);
    let deleted = 0;
    if (MODE === 'replace') {
      deleted = await deleteByKeys(p.table, p.toDelete, p.pk);
    }
    console.log(`  ✓ ${p.table}: upsert ${upserted}, delete ${deleted}`);
  }
  console.log('\n완료.');
};

main().catch((e) => { console.error('\n✗ 복원 실패:', e); process.exit(1); });
