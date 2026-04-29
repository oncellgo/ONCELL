// ---------------------------------------------------------------
// 덤프 SQL 변환: dearday_* 제거 + kcis_* → oncell_* 이름 치환
// 사용:
//   node scripts/transform-dump.mjs --in full-dump.sql --out oncell-dump.sql
//   node scripts/transform-dump.mjs --in full-dump.sql --out oncell-dump.sql --dry   # 통계만
//
// 동작:
// 1) dearday_* 테이블 관련 SQL 라인/블록 모두 제외
// 2) 식별자 위치의 kcis_* → oncell_* 로 치환 (문자열 리터럴 내부는 보존)
// 3) 결과를 새 파일로 저장
// ---------------------------------------------------------------
import { readFileSync, writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const IN  = getArg('--in', 'full-dump.sql');
const OUT = getArg('--out', 'oncell-dump.sql');
const DRY = argv.includes('--dry');

const FILTER_PREFIX  = 'dearday_';   // 이 prefix 의 테이블은 통째 제외
const RENAME_FROM    = 'kcis_';      // 이 prefix 를
const RENAME_TO      = 'oncell_';    // 이걸로 치환

const src = readFileSync(IN, 'utf8');
const lines = src.split(/\r?\n/);

const stats = {
  in: lines.length,
  dropped: 0,
  renamed: 0,
  blocksDropped: 0,
};

const out = [];
let inDropBlock = false;     // dearday_ CREATE TABLE 블록 진행 중
let dropDepth = 0;           // 괄호 짝맞추기

for (let raw of lines) {
  // --- 멀티라인 DROP 블록 처리 (CREATE TABLE ... ) ---
  if (inDropBlock) {
    // 괄호 카운트로 종료 감지
    for (const ch of raw) {
      if (ch === '(') dropDepth++;
      else if (ch === ')') dropDepth--;
    }
    if (raw.match(/\)\s*;\s*$/) && dropDepth <= 0) {
      inDropBlock = false;
      dropDepth = 0;
      stats.blocksDropped++;
    }
    stats.dropped++;
    continue;
  }

  // --- 한 줄에서 dearday_ 가 식별자로 등장하는지 검사 ---
  // 데이터 INSERT, ALTER, INDEX, POLICY, SEQUENCE, TRIGGER 모두 체크
  if (referencesPrefix(raw, FILTER_PREFIX)) {
    // CREATE TABLE 시작이면 멀티라인 블록 진입
    if (/^\s*CREATE\s+TABLE/i.test(raw)) {
      inDropBlock = true;
      dropDepth = 0;
      for (const ch of raw) {
        if (ch === '(') dropDepth++;
        else if (ch === ')') dropDepth--;
      }
      // 한 줄로 닫히는 경우 (드물지만)
      if (raw.match(/\)\s*;\s*$/) && dropDepth <= 0) {
        inDropBlock = false;
        dropDepth = 0;
        stats.blocksDropped++;
      }
    }
    stats.dropped++;
    continue;
  }

  // --- kcis_* → oncell_* 치환 (문자열 리터럴 외부에서만) ---
  const before = raw;
  const after  = renameOutsideStrings(raw, RENAME_FROM, RENAME_TO);
  if (before !== after) stats.renamed++;
  out.push(after);
}

if (DRY) {
  console.log('--- DRY RUN ---');
  console.log(`입력: ${IN} (${stats.in} 줄)`);
  console.log(`drop 라인 수: ${stats.dropped}`);
  console.log(`drop 블록 수 (CREATE TABLE 등): ${stats.blocksDropped}`);
  console.log(`치환된 라인 수: ${stats.renamed}`);
  console.log(`출력 라인 수: ${out.length}`);
  process.exit(0);
}

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`✓ ${OUT} 생성`);
console.log(`  입력 ${stats.in} 줄 → 출력 ${out.length} 줄`);
console.log(`  ${FILTER_PREFIX}* drop: ${stats.dropped} 라인 (블록 ${stats.blocksDropped}개)`);
console.log(`  ${RENAME_FROM}→${RENAME_TO} 치환: ${stats.renamed} 라인`);

// =========================================================================

/**
 * 라인 내 (문자열 리터럴 외부에서) 특정 prefix 식별자가 등장하는지.
 * 예: "public.dearday_card" 매칭, "'dearday_card'" (값) 비매칭.
 */
function referencesPrefix(line, prefix) {
  const segments = splitOutOfStrings(line);
  for (const seg of segments) {
    // 단어 경계 직후 prefix
    const re = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRe(prefix)}[a-zA-Z0-9_]+`);
    if (re.test(seg)) return true;
  }
  return false;
}

/**
 * 문자열 리터럴 외부에서만 prefix 치환.
 * 'kcis_app_kv' (문자열 값) 은 보존, public.kcis_app_kv (식별자) 만 치환.
 */
function renameOutsideStrings(line, from, to) {
  const parts = [];
  let i = 0;
  let inStr = false;
  let buf = '';
  while (i < line.length) {
    const ch = line[i];
    if (!inStr) {
      if (ch === "'") {
        // 외부 → 문자열 진입: 지금까지 buf 처리
        parts.push(replaceIdent(buf, from, to));
        buf = "'";
        inStr = true;
      } else {
        buf += ch;
      }
    } else {
      buf += ch;
      if (ch === "'") {
        // 다음 글자가 ' 이면 escape (SQL 표준 '' 이중작은따옴표)
        if (line[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        // 문자열 종료
        parts.push(buf);
        buf = '';
        inStr = false;
      }
    }
    i++;
  }
  // 남은 buf
  if (inStr) {
    // 닫히지 않은 문자열(멀티라인 가능성) — 그대로 푸시
    parts.push(buf);
  } else {
    parts.push(replaceIdent(buf, from, to));
  }
  return parts.join('');
}

function replaceIdent(s, from, to) {
  // 식별자 경계: 앞에 영숫자/_ 가 아닐 때만 치환
  const re = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRe(from)}([a-zA-Z0-9_]+)`, 'g');
  return s.replace(re, (m, pre, rest) => `${pre}${to}${rest}`);
}

/** 문자열 리터럴('...')을 잘라내고, 외부 세그먼트들만 반환 */
function splitOutOfStrings(line) {
  const segs = [];
  let inStr = false;
  let buf = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (!inStr) {
      if (ch === "'") { segs.push(buf); buf = ''; inStr = true; }
      else buf += ch;
    } else {
      if (ch === "'") {
        if (line[i + 1] === "'") { i += 2; continue; }
        inStr = false;
      }
    }
    i++;
  }
  segs.push(buf);
  return segs;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
