// ---------------------------------------------------------------
// 모든 캐시 성격의 KV 엔트리 삭제.
//
// 대상 (kcis_app_kv 테이블):
//   - key LIKE 'qt_%'                 — QT 일일 캐시
//   - key LIKE 'monthly_schedule_%'   — 월간 목회일정 캐시
//
// 유지:
//   - settings / system_admins / worship_templates (설정 · 관리자 · 예배 템플릿 — 캐시 아님)
//
// 메모리 캐시(lib/youtube.ts, pages/api/qt.ts 등)는 서버 재시작으로 자동 초기화.
// Vercel의 경우 재배포 or cold start로 리셋됨.
//
// 사용:
//   dry-run: node scripts/wipe-caches.mjs
//   실행:    node scripts/wipe-caches.mjs --execute
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
  console.error('[wipe-caches] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const TABLE = 'kcis_app_kv';
const EXECUTE = process.argv.includes('--execute');

const CACHE_PREFIXES = ['qt_', 'monthly_schedule_'];

(async () => {
  console.log(`[wipe-caches] mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  const { data: rows, error } = await supabase.from(TABLE).select('key, updated_at');
  if (error) {
    console.error('[wipe-caches] 조회 실패:', error.message);
    process.exit(1);
  }
  const all = rows || [];
  const cacheRows = all.filter((r) => CACHE_PREFIXES.some((p) => (r.key || '').startsWith(p)));
  const preserved = all.filter((r) => !CACHE_PREFIXES.some((p) => (r.key || '').startsWith(p)));

  console.log(`\n[wipe-caches] 전체 KV 엔트리: ${all.length}`);
  console.log(`  - 캐시 삭제 대상: ${cacheRows.length}`);
  console.log(`  - 유지: ${preserved.length}`);

  if (cacheRows.length === 0) {
    console.log('\n[wipe-caches] 삭제 대상 없음.');
    return;
  }

  console.log('\n[wipe-caches] 삭제 대상 목록:');
  for (const r of cacheRows) {
    console.log(`  - ${r.key}  (updated_at=${r.updated_at || 'n/a'})`);
  }
  console.log('\n[wipe-caches] 유지 목록:');
  for (const r of preserved) {
    console.log(`  - ${r.key}`);
  }

  if (!EXECUTE) {
    console.log('\n[wipe-caches] DRY-RUN 완료. 실제 삭제하려면 --execute 옵션 추가.');
    return;
  }

  const keysToDelete = cacheRows.map((r) => r.key);
  const { error: delErr } = await supabase.from(TABLE).delete().in('key', keysToDelete);
  if (delErr) {
    console.error('[wipe-caches] 삭제 실패:', delErr.message);
    process.exit(1);
  }
  console.log(`\n[wipe-caches] ${keysToDelete.length}건 삭제 완료.`);
})().catch((e) => {
  console.error('[wipe-caches] fatal:', e);
  process.exit(1);
});
