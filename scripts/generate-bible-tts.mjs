// ---------------------------------------------------------------
// 성경 장별 TTS 사전 녹음 스크립트
//   data/bible.json (개역한글) → Google Cloud TTS → Supabase Storage 'bible-tts' 버킷
//
// 사용법:
//   dry-run (전체 책 미리보기):
//     node scripts/generate-bible-tts.mjs --voice=ko-KR-Wavenet-B
//
//   실제 실행 — 모든 장:
//     node scripts/generate-bible-tts.mjs --voice=ko-KR-Wavenet-B --execute
//
//   특정 책만:
//     node scripts/generate-bible-tts.mjs --voice=ko-KR-Wavenet-B --book=창세기 --execute
//     node scripts/generate-bible-tts.mjs --voice=ko-KR-Wavenet-B --book=창세기 --start=1 --end=10 --execute
//
//   resume (이미 업로드된 파일 skip — 기본 동작):
//     node scripts/generate-bible-tts.mjs --voice=ko-KR-Wavenet-B --execute
//   (--force 로 덮어쓰기)
//
// 환경변수:
//   GOOGLE_TTS_API_KEY            (필수 — Google Cloud TTS)
//   NEXT_PUBLIC_SUPABASE_URL      (필수)
//   SUPABASE_SERVICE_ROLE_KEY     (필수 — Storage 업로드)
//
// 진행상황: scripts/.bible-tts-progress.json (재실행 시 자동 사용)
// ---------------------------------------------------------------
import { readFileSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
const TTS_KEY = process.env.GOOGLE_TTS_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !TTS_KEY) {
  console.error('필요한 env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_TTS_API_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = 'bible-tts';
const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_BYTES = 4500;
const RATE_LIMIT_MS = 1100; // 1초 + 버퍼

// CLI 인자
const getArg = (name) => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');
const VOICE = getArg('voice') || 'ko-KR-Wavenet-B';
const ONLY_BOOK = getArg('book');
const RANGE_START = getArg('start') ? parseInt(getArg('start'), 10) : null;
const RANGE_END = getArg('end') ? parseInt(getArg('end'), 10) : null;

// 진행상황
const PROGRESS_FILE = path.resolve('scripts/.bible-tts-progress.json');
const loadProgress = () => {
  try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')); } catch { return { completed: {}, failed: {} }; }
};
const saveProgress = (p) => {
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); } catch (e) { console.error('progress save failed', e); }
};

// 책 한글명 → 슬러그
const SLUG = {
  '창세기':'genesis','출애굽기':'exodus','레위기':'leviticus','민수기':'numbers','신명기':'deuteronomy',
  '여호수아':'joshua','사사기':'judges','룻기':'ruth','사무엘상':'1samuel','사무엘하':'2samuel',
  '열왕기상':'1kings','열왕기하':'2kings','역대상':'1chronicles','역대하':'2chronicles','에스라':'ezra',
  '느헤미야':'nehemiah','에스더':'esther','욥기':'job','시편':'psalms','잠언':'proverbs',
  '전도서':'ecclesiastes','아가':'songofsongs','이사야':'isaiah','예레미야':'jeremiah','예레미야애가':'lamentations',
  '에스겔':'ezekiel','다니엘':'daniel','호세아':'hosea','요엘':'joel','아모스':'amos',
  '오바댜':'obadiah','요나':'jonah','미가':'micah','나훔':'nahum','하박국':'habakkuk',
  '스바냐':'zephaniah','학개':'haggai','스가랴':'zechariah','말라기':'malachi',
  '마태복음':'matthew','마가복음':'mark','누가복음':'luke','요한복음':'john','사도행전':'acts',
  '로마서':'romans','고린도전서':'1corinthians','고린도후서':'2corinthians','갈라디아서':'galatians','에베소서':'ephesians',
  '빌립보서':'philippians','골로새서':'colossians','데살로니가전서':'1thessalonians','데살로니가후서':'2thessalonians',
  '디모데전서':'1timothy','디모데후서':'2timothy','디도서':'titus','빌레몬서':'philemon',
  '히브리서':'hebrews','야고보서':'james','베드로전서':'1peter','베드로후서':'2peter',
  '요한일서':'1john','요한이서':'2john','요한삼서':'3john','유다서':'jude','요한계시록':'revelation',
};

// 한자어 숫자
const sinoKorean = (n) => {
  if (n === 0) return '영';
  const ones = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  if (n < 10) return ones[n];
  if (n < 20) return '십' + (n === 10 ? '' : ones[n - 10]);
  if (n < 100) { const t = Math.floor(n/10); const o = n%10; return ones[t] + '십' + (o === 0 ? '' : ones[o]); }
  if (n < 1000) { const h = Math.floor(n/100); const rest = n%100; return (h===1?'':ones[h]) + '백' + (rest === 0 ? '' : sinoKorean(rest)); }
  return String(n);
};

// 본문 정리: 괄호 한자 제거, 느낌표 → 마침표
const cleanVerse = (s) => s
  .replace(/\([^)]*\)/g, '')
  .replace(/!/g, '.')
  .replace(/\s+/g, ' ')
  .trim();

// 장 본문 → TTS 청크 배열 (절번호 미독, 한자어 변환)
const buildChunks = (book, chapter, verses) => {
  const chunks = [];
  // 시작: "창세기 일장."
  chunks.push(`${book} ${sinoKorean(chapter)}장.`);
  for (const v of verses) {
    const clean = cleanVerse(v);
    if (!clean) continue;
    chunks.push(clean);
  }
  // 5KB 한도 내 묶기 (작은 chunk 들 합치기)
  const merged = [];
  let buf = '';
  for (const c of chunks) {
    const candidate = buf ? `${buf}\n${c}` : c;
    if (Buffer.byteLength(candidate, 'utf8') > MAX_BYTES) {
      if (buf) merged.push(buf);
      // 단일 절이 한도 초과 시 강제 분할
      if (Buffer.byteLength(c, 'utf8') > MAX_BYTES) {
        let rest = c;
        while (Buffer.byteLength(rest, 'utf8') > MAX_BYTES) {
          // 대략적인 글자 단위 자르기
          const cut = Math.floor(rest.length * MAX_BYTES / Buffer.byteLength(rest, 'utf8'));
          merged.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        buf = rest;
      } else {
        buf = c;
      }
    } else {
      buf = candidate;
    }
  }
  if (buf) merged.push(buf);
  return merged;
};

// Google TTS 호출 → MP3 buffer
const ttsChunk = async (text, voice) => {
  const r = await fetch(`${TTS_URL}?key=${encodeURIComponent(TTS_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ko-KR', name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1, pitch: 0 },
    }),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`TTS ${r.status}: ${errText.slice(0, 200)}`);
  }
  const j = await r.json();
  if (!j.audioContent) throw new Error('no audioContent');
  return Buffer.from(j.audioContent, 'base64');
};

// retry wrapper
const withRetry = async (fn, label, maxTries = 3) => {
  let lastErr;
  for (let i = 0; i < maxTries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const wait = (i + 1) * 2000;
      console.warn(`  [retry ${i+1}/${maxTries}] ${label} — ${e.message}. wait ${wait}ms`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr;
};

// 업로드 — 동일 path 있으면 skip (FORCE 시 덮어쓰기)
const uploadAudio = async (storagePath, buffer) => {
  if (!FORCE) {
    const { data: info } = await db.storage.from(BUCKET).list(path.dirname(storagePath), {
      limit: 100,
      search: path.basename(storagePath),
    });
    if (info && info.some((f) => f.name === path.basename(storagePath))) return 'skipped';
  }
  const { error } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  });
  if (error) throw new Error(`upload: ${error.message}`);
  return 'uploaded';
};

// 메인
const main = async () => {
  const data = JSON.parse(readFileSync('data/bible.json', 'utf8'));
  const order = data.order;
  const books = data.books;
  const progress = loadProgress();

  const targetBooks = ONLY_BOOK ? [ONLY_BOOK] : order;

  console.log(`\n=== 성경 TTS 사전 녹음 ===`);
  console.log(`voice:    ${VOICE}`);
  console.log(`bucket:   ${BUCKET}`);
  console.log(`books:    ${targetBooks.length}개${ONLY_BOOK ? ` (${ONLY_BOOK})` : ' (전체)'}`);
  console.log(`mode:     ${EXECUTE ? 'EXECUTE' : 'dry-run'}${FORCE ? ' (force overwrite)' : ' (skip existing)'}`);
  console.log();

  let totalChapters = 0;
  let totalChars = 0;
  let totalChunks = 0;
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const book of targetBooks) {
    if (!books[book]) { console.warn(`  [skip] book not found: ${book}`); continue; }
    const slug = SLUG[book];
    if (!slug) { console.warn(`  [skip] slug missing for: ${book}`); continue; }

    const chapterKeys = Object.keys(books[book]).map(Number).sort((a, b) => a - b);
    const filteredChapters = chapterKeys.filter((c) =>
      (RANGE_START === null || c >= RANGE_START) &&
      (RANGE_END === null || c <= RANGE_END)
    );

    console.log(`\n─ ${book} (${filteredChapters.length}장) ${'─'.repeat(60 - book.length)}`);

    for (const chapter of filteredChapters) {
      totalChapters++;
      const verseObj = books[book][chapter];
      const verseNums = Object.keys(verseObj).map(Number).sort((a, b) => a - b);
      const verses = verseNums.map((n) => verseObj[n]);
      const chunks = buildChunks(book, chapter, verses);
      const charCount = verses.reduce((s, v) => s + v.length, 0);
      totalChars += charCount;
      totalChunks += chunks.length;

      const storagePath = `${VOICE}/${slug}/${chapter}.mp3`;
      const progressKey = `${VOICE}|${book}|${chapter}`;

      if (progress.completed[progressKey] && !FORCE) {
        console.log(`  [skip] ${book} ${chapter}장 (이미 완료)`);
        totalSkipped++;
        continue;
      }

      console.log(`  [${book} ${chapter}장] ${verses.length}절 / ${charCount}자 / ${chunks.length}청크 → ${storagePath}`);

      if (!EXECUTE) continue;

      try {
        // 청크별 TTS 호출 후 binary concat (MP3 frame-based concat 안전)
        const buffers = [];
        for (let i = 0; i < chunks.length; i++) {
          const buf = await withRetry(() => ttsChunk(chunks[i], VOICE), `tts ${book} ${chapter} chunk ${i+1}`);
          buffers.push(buf);
          await new Promise((res) => setTimeout(res, RATE_LIMIT_MS));
        }
        const audio = Buffer.concat(buffers);
        const result = await withRetry(() => uploadAudio(storagePath, audio), `upload ${book} ${chapter}`);
        if (result === 'uploaded') totalUploaded++; else totalSkipped++;
        console.log(`    ✓ ${result} (${(audio.length / 1024).toFixed(1)}KB)`);
        progress.completed[progressKey] = { uploadedAt: new Date().toISOString(), size: audio.length };
        delete progress.failed[progressKey];
        saveProgress(progress);
      } catch (e) {
        totalFailed++;
        console.error(`    ✗ FAILED: ${e.message}`);
        progress.failed[progressKey] = { error: e.message, at: new Date().toISOString() };
        saveProgress(progress);
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`완료: ${totalChapters}장 / ${totalChars}자 / ${totalChunks}청크`);
  console.log(`업로드: ${totalUploaded} · 스킵: ${totalSkipped} · 실패: ${totalFailed}`);
  if (totalFailed > 0) {
    console.log(`\n실패 목록 (재실행 시 자동 retry):`);
    Object.entries(progress.failed).slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v.error}`));
  }
  console.log();
  if (!EXECUTE) console.log(`dry-run 종료. 실제 실행: --execute 추가`);
};

main().catch((e) => { console.error(e); process.exit(1); });
