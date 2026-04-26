import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../lib/db';

import { PDFParse } from '../../lib/pdf';

/**
 * 이번달 교회 목회일정 추출.
 *
 * 파이프라인:
 *   1. koreanchurch.sg/noticeandnews 에서 가장 최근 "YYYY년 M월 D일 주보" 게시물을 찾음
 *   2. 해당 게시물 본문에서 "미스바" 링크를 추출 (href/텍스트에 misba|미스바|mizpah 포함)
 *   3. 미스바 PDF 다운로드 → 텍스트 추출
 *   4. "M월 목회일정" 섹션을 찾아 날짜별 항목 파싱
 *   5. [{ date: 'YYYY-MM-DD', label: 'M/D', title }] 목록 반환
 *
 * GET /api/monthly-schedule?month=M  (기본: 현재 월)
 *   → { month, items, source: { bulletinIdx, misbaUrl } }
 */

const LIST_URL = 'https://koreanchurch.sg/noticeandnews';
const POST_URL = (idx: string) => `https://koreanchurch.sg/noticeandnews/?bmode=view&idx=${idx}&t=board`;
const CACHE_TTL = 60 * 60 * 1000;  // 1시간

const pad = (n: number) => String(n).padStart(2, '0');
const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

type Item = { date: string; label: string; title: string };
type Cached = { at: number; month: number; year: number; items: Item[]; bulletinIdx: string | null; misbaUrl: string | null };

// 메모리 캐시 — warm invocation 에서 PDF 재파싱 생략
const memoryCache = new Map<string, Cached>();

// 영구 캐시 — Supabase app_kv. Cold start에도 유지.
const kvKeyOf = (year: number, month: number) => `monthly_schedule_${year}_${pad(month)}`;
const readPersistedCache = async (year: number, month: number): Promise<Cached | null> => {
  try { return await kvGet<Cached>(kvKeyOf(year, month)); } catch { return null; }
};
const writePersistedCache = async (year: number, month: number, data: Cached): Promise<void> => {
  try { await kvSet(kvKeyOf(year, month), data); } catch {}
};

const findLatestBulletin = async (): Promise<{ idx: string; dateKey: string } | null> => {
  const res = await fetch(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const re = /idx=(\d+)[^"]*"[\s\S]{0,2000}?<span[^>]*>\s*([^<]{3,100})\s*<\/span>/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const bulletins: Array<{ idx: string; dateKey: string }> = [];
  while ((m = re.exec(html)) !== null) {
    const idx = m[1];
    if (seen.has(idx)) continue;
    seen.add(idx);
    const title = decodeEntities(m[2]).trim();
    if (!/주보/.test(title)) continue;
    const dm = title.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (!dm) continue;
    bulletins.push({ idx, dateKey: `${dm[1]}-${pad(+dm[2])}-${pad(+dm[3])}` });
  }
  bulletins.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return bulletins[0] || null;
};

// Google Drive 공유 URL (`/file/d/{ID}/view` 또는 `/open?id=`)을 직접 다운로드 URL로 변환.
// 공유 뷰어 페이지를 그대로 fetch 하면 HTML이 와서 pdf-parse 실패하므로 필수 전처리.
const toDirectDownloadUrl = (url: string): string => {
  if (!url) return url;
  // https://drive.google.com/file/d/{ID}/view?...
  let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  // https://drive.google.com/open?id={ID}
  m = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return url;
};

// Google Drive가 대용량 파일에 대해 "scan 불가" 경고 HTML을 반환하는 경우
// 응답 내 confirm 토큰을 파싱해 한 번 더 요청한다.
const fetchPdfBuffer = async (url: string): Promise<Buffer> => {
  const direct = toDirectDownloadUrl(url);
  let res = await fetch(direct, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`http-${res.status}`);
  const ctype = res.headers.get('content-type') || '';
  if (/text\/html/i.test(ctype)) {
    // Drive 경고 페이지 → confirm 토큰 추출해 재요청
    const html = await res.text();
    const t = html.match(/confirm=([0-9A-Za-z_]+)/) || html.match(/"downloadUrl":"([^"]+)"/);
    if (t && t[0].startsWith('confirm=')) {
      const withConfirm = direct + `&confirm=${t[1]}`;
      res = await fetch(withConfirm, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (!res.ok) throw new Error(`http-${res.status} (confirm retry)`);
    } else {
      throw new Error('drive-html-response (no confirm token)');
    }
  }
  return Buffer.from(await res.arrayBuffer());
};

const findMisbaUrl = async (idx: string): Promise<string | null> => {
  const res = await fetch(POST_URL(idx), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const bodyMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
  const body = bodyMatch ? bodyMatch[1] : html;
  const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const candidates: string[] = [];
  let a: RegExpExecArray | null;
  while ((a = anchorRe.exec(body)) !== null) {
    const url = decodeEntities(a[1]);
    const text = decodeEntities(a[2].replace(/<[^>]+>/g, '')).trim();
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) continue;
    if (/misba|미스바|mizpah/i.test(url) || /미스바|misba|mizpah/i.test(text)) candidates.push(url);
  }
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
};

// 실제 미스바 "M월 목회일정" 포맷 기반 파서.
// 허용 패턴 (불릿 • 옵션):
//   1. "D(요일) 제목"              예: "3(금) 성금요일 연합예배"
//   2. "D(요일)-D(요일) 제목"       예: "14(화)-17(금) 전교인 성경통독 수련회"
//   3. "M.D(요일) 제목"             예: "4.3(금) ..."
//   4. "M.D(요일)-M.D(요일) 제목"    예: "3.30(월)-4.3(금) 고난주간전교인새벽기도"
// 요일: 월/화/수/목/금/토/일/주일 (한글 1~2자)
const parseSchedule = (pdfText: string, month: number, year: number): Item[] => {
  if (!pdfText) return [];
  const clean = pdfText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');

  // "M월 목회일정" 헤더 매치
  const header = new RegExp(`${month}\\s*월\\s*목\\s*회\\s*일\\s*정`);
  const headerMatch = clean.match(header);
  if (!headerMatch || typeof headerMatch.index !== 'number') return [];
  const afterStart = headerMatch.index + headerMatch[0].length;
  const after = clean.slice(afterStart);

  // 다음 큰 섹션 헤더 전까지만
  const stopRe = /(?:\d+\s*월\s*교회\s*력|주간\s*사역|예배\s*일정|광고|Announcement|담당\s*교역자)/;
  const stopIdx = after.search(stopRe);
  const section = stopIdx >= 0 ? after.slice(0, stopIdx) : after;

  // 줄바꿈(또는 불릿 •/◦/○/◆/■/▪) 기준으로 블록 분리.
  // 주의: `·` (가운데점) 은 "세례·입교문답" 같은 본문 구분자로 쓰이므로 split 기호에서 제외.
  const blocks = section
    .split(/(?:\r?\n|[•◦○◆■▪])/)
    .map((s) => s.replace(/[- ​-‍﻿]/g, '').replace(/s+/g, ' ').trim())
    .filter((s) => s.length > 0);

  const items: Item[] = [];
  const seen = new Set<string>();

  // 각 패턴별 정규식 — 순서대로 시도
  const rangeMD = /^(\d{1,2})\.(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s*-\s*(\d{1,2})\.(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s+(.{2,120}?)$/;
  const rangeDayOnly = /^(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s*-\s*(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s+(.{2,120}?)$/;
  const singleMD = /^(\d{1,2})\.(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s+(.{2,120}?)$/;
  const singleDay = /^(\d{1,2})\s*\(\s*[가-힣]{1,2}\s*\)\s+(.{2,120}?)$/;

  for (const raw of blocks) {
    if (!raw) continue;
    let startMonth = month, startDay = 0, endMonth = month, endDay = 0, title = '';
    let m: RegExpMatchArray | null;
    if ((m = raw.match(rangeMD))) {
      startMonth = +m[1]; startDay = +m[2]; endMonth = +m[3]; endDay = +m[4]; title = m[5].trim();
    } else if ((m = raw.match(rangeDayOnly))) {
      startMonth = month; startDay = +m[1]; endMonth = month; endDay = +m[2]; title = m[3].trim();
    } else if ((m = raw.match(singleMD))) {
      startMonth = +m[1]; startDay = +m[2]; endMonth = startMonth; endDay = startDay; title = m[3].trim();
    } else if ((m = raw.match(singleDay))) {
      startMonth = month; startDay = +m[1]; endMonth = month; endDay = startDay; title = m[2].trim();
    } else {
      continue;
    }
    if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) continue;
    if (title.length < 2 || title.length > 120) continue;

    // 대상 월과의 교집합 체크 — 시작·종료 중 하나라도 대상 월이면 포함
    if (startMonth !== month && endMonth !== month) continue;

    // label: 단일 날이면 "M/D", 범위면 "M/D~M/D"
    const isRange = !(startMonth === endMonth && startDay === endDay);
    const label = isRange
      ? `${startMonth}/${startDay}~${endMonth}/${endDay}`
      : `${startMonth}/${startDay}`;
    // date anchor: 시작이 현재 월이면 시작일, 아니면 현재 월의 1일로 잡아 정렬
    const anchorMonth = startMonth === month ? startMonth : month;
    const anchorDay = startMonth === month ? startDay : 1;

    const key = `${anchorMonth}-${anchorDay}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      date: `${year}-${pad(anchorMonth)}-${pad(anchorDay)}`,
      label,
      title,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const monthParam = typeof req.query.month === 'string' ? Number(req.query.month) : now.getMonth() + 1;
    const month = Math.min(12, Math.max(1, monthParam));

    const ckey = kvKeyOf(year, month);
    const nowMs = Date.now();
    const debug = req.query.debug === '1';

    // 1) 메모리 캐시 (같은 인스턴스의 warm 요청) — 디버그 요청은 캐시 바이패스
    const hit = !debug ? memoryCache.get(ckey) : undefined;
    if (hit && nowMs - hit.at < CACHE_TTL) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ month, year, items: hit.items, source: { bulletinIdx: hit.bulletinIdx, misbaUrl: hit.misbaUrl }, cached: 'memory' });
    }

    // 2) 영구 캐시 (Supabase KV) — cold start 에도 유지. 디버그는 바이패스
    const persisted = !debug ? await readPersistedCache(year, month) : null;
    if (persisted && nowMs - persisted.at < CACHE_TTL) {
      memoryCache.set(ckey, persisted);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ month, year, items: persisted.items, source: { bulletinIdx: persisted.bulletinIdx, misbaUrl: persisted.misbaUrl }, cached: 'kv' });
    }

    const bulletin = await findLatestBulletin();
    if (!bulletin) return res.status(200).json({ month, year, items: [], reason: 'no-bulletin' });

    const misbaUrl = await findMisbaUrl(bulletin.idx);
    if (!misbaUrl) return res.status(200).json({ month, year, items: [], source: { bulletinIdx: bulletin.idx, misbaUrl: null }, reason: 'no-misba' });

    // PDF 다운로드 — 미스바는 1·2페이지에 목회일정, 3페이지부터 설교문이라 앞 2페이지만 파싱.
    // 파일 크기 30MB+ 라서 첫 2페이지만 추출하면 메모리/시간 부담 크게 감소.
    let pdfText = '';
    try {
      const buf = await fetchPdfBuffer(misbaUrl);
      const parser = new PDFParse({ data: buf });
      const parsed = await parser.getText({ first: 2 });
      pdfText = parsed.text || '';
    } catch (e: any) {
      console.error('[monthly-schedule] pdf fetch/parse failed', e?.message || e);
      return res.status(200).json({ month, year, items: [], source: { bulletinIdx: bulletin.idx, misbaUrl }, reason: `pdf-failed: ${e?.message || ''}` });
    }

    // 미스바는 발행 시점에 따라 이번달 또는 다음달 목회일정을 담음.
    // (예: 월말 발행 미스바엔 다음달 일정이 들어있음). 요청 월(=현재달) 헤더가 없으면
    // PDF 안에서 가장 첫 번째로 나오는 'M월 목회일정' 헤더의 월을 자동 채택.
    const requestedHeaderRe = new RegExp(`${month}\\s*월\\s*목\\s*회\\s*일\\s*정`);
    let effectiveMonth = month;
    if (!requestedHeaderRe.test(pdfText)) {
      const anyHeader = pdfText.match(/(\d{1,2})\s*월\s*목\s*회\s*일\s*정/);
      if (anyHeader) {
        const detected = Number(anyHeader[1]);
        if (detected >= 1 && detected <= 12) effectiveMonth = detected;
      }
    }

    const items = parseSchedule(pdfText, effectiveMonth, year);
    const fresh: Cached = { at: Date.now(), month: effectiveMonth, year, items, bulletinIdx: bulletin.idx, misbaUrl };
    memoryCache.set(ckey, fresh);
    // 파싱 성공시에만 영구 캐시에 저장 (빈 결과를 고정시키지 않음). 캐시 키는 요청 월 기준 유지.
    if (items.length > 0) await writePersistedCache(year, month, fresh);

    // 디버그: ?debug=1 → 헤더 전후 raw text + 블록 파싱 결과 반환
    if (req.query.debug === '1') {
      const header = new RegExp(`${month}\\s*월\\s*목\\s*회\\s*일\\s*정`);
      const hm = pdfText.match(header);
      const hi = hm?.index ?? -1;
      const snippet = hi >= 0 ? pdfText.slice(hi, hi + 1500) : pdfText.slice(0, 1500);

      // parseSchedule 내부 단계 덤프
      const clean = pdfText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');
      const headerMatch = clean.match(header);
      const afterStart = headerMatch && typeof headerMatch.index === 'number' ? headerMatch.index + headerMatch[0].length : -1;
      const after = afterStart >= 0 ? clean.slice(afterStart) : '';
      const stopRe = /(?:\d+\s*월\s*교회\s*력|주간\s*사역|예배\s*일정|광고|Announcement|담당\s*교역자)/;
      const stopIdx = after.search(stopRe);
      const section = stopIdx >= 0 ? after.slice(0, stopIdx) : after;
      const blocks = section.split(/(?:\r?\n|[•◦○◆■▪])/).map((s) => s.replace(/[- ​-‍﻿]/g, '').replace(/s+/g, ' ').trim()).filter((s) => s.length > 0);

      return res.status(200).json({ month, year, items, headerIdx: hi, headerMatchLen: headerMatch?.[0]?.length ?? null, afterStart, stopIdx, sectionLen: section.length, blocksCount: blocks.length, blocks: blocks.slice(0, 30), snippet, rawLength: pdfText.length });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ month: effectiveMonth, year, items, source: { bulletinIdx: bulletin.idx, misbaUrl } });
  } catch (e: any) {
    console.error('[monthly-schedule]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
}
