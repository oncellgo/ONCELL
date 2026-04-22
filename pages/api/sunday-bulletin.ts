import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupPassage, formatVerses } from '../../lib/bible';
import { PDFParse } from '../../lib/pdf';
import { makeKvCache } from '../../lib/crawlCache';

/**
 * 주일(YYYY-MM-DD)에 해당하는 주보 게시글을 찾아 성경봉독 구절 + 첨부 파일 목록 + 미스바 링크를 반환.
 *
 * 응답에 `files`·`misbaUrl` 을 포함해 클라이언트가 `/api/bulletin-file` 를 추가 호출하지 않아도 되도록 함.
 * 목록/상세는 Supabase KV 에 영속 캐시 — 람다 콜드스타트에도 크롤·PDF파싱 재사용.
 *
 * 추출 우선순위:
 *   1) 게시글 본문 텍스트에서 "성경봉독 ..." 매칭
 *   2) 첨부 파일명의 `(책명 N:V-V)` 괄호 패턴
 *   3) 첨부가 PDF이면 PDF 텍스트에서 "성경봉독 ..." 매칭
 */

const LIST_URL = 'https://koreanchurch.sg/noticeandnews';
const POST_URL = (idx: string) => `https://koreanchurch.sg/noticeandnews/?bmode=view&idx=${idx}&t=board`;
const LIST_TTL = 30 * 60 * 1000;        // 목록(주보 게시글 인덱스) — 30분
const DETAIL_TTL = 24 * 60 * 60 * 1000; // 게시글 상세(PDF 파싱 결과 포함) — 24시간

const pad = (n: number) => String(n).padStart(2, '0');

const BOOK_ABBR: Record<string, string> = {
  창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기',
  수: '여호수아', 삿: '사사기', 룻: '룻기',
  삼상: '사무엘상', 삼하: '사무엘하', 왕상: '열왕기상', 왕하: '열왕기하',
  대상: '역대상', 대하: '역대하', 스: '에스라', 느: '느헤미야', 에: '에스더',
  욥: '욥기', 시: '시편', 잠: '잠언', 전: '전도서', 아: '아가',
  사: '이사야', 렘: '예레미야', 애: '예레미야애가', 겔: '에스겔', 단: '다니엘',
  호: '호세아', 욜: '요엘', 암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가',
  나: '나훔', 합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기',
  마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음', 행: '사도행전',
  롬: '로마서', 고전: '고린도전서', 고후: '고린도후서', 갈: '갈라디아서',
  엡: '에베소서', 빌: '빌립보서', 골: '골로새서',
  살전: '데살로니가전서', 살후: '데살로니가후서', 딤전: '디모데전서', 딤후: '디모데후서',
  딛: '디도서', 몬: '빌레몬서', 히: '히브리서', 약: '야고보서',
  벧전: '베드로전서', 벧후: '베드로후서',
  요일: '요한일서', 요이: '요한이서', 요삼: '요한삼서', 유: '유다서', 계: '요한계시록',
};

const normalizeBook = (s: string): string => BOOK_ABBR[s] || s;

const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const stripTags = (s: string): string =>
  s.replace(/<\/?(?:p|br|div|span)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n\n').trim();

const guessMime = (name: string | null): string => {
  if (!name) return 'application/octet-stream';
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};

// 성경봉독 패턴 — "성경봉독: 요한복음 20:1-14" / "성경봉독 요 20장 1-14절" 등
const SCRIPTURE_RE = /성경\s*봉독\s*[:：]?\s*([가-힣]{1,5})\s*(\d{1,3})\s*(?:장|[:：])\s*(\d{1,3})(?:\s*[-~]\s*(?:(\d{1,3})\s*(?:장|[:：])\s*)?(\d{1,3}))?/;
const PAREN_REF_RE = /\(\s*([가-힣]{1,5})\s*(\d{1,3})\s*(?:장|[:：])\s*(\d{1,3})(?:\s*[-~]\s*(?:(\d{1,3})\s*(?:장|[:：])\s*)?(\d{1,3}))?\s*\)/;

type Match = { book: string; startCh: number; startVerse: number; endCh: number; endVerse: number };

const parseMatch = (m: RegExpMatchArray): Match => {
  const book = normalizeBook(m[1]);
  const startCh = Number(m[2]);
  const startVerse = Number(m[3]);
  const endCh = m[4] ? Number(m[4]) : startCh;
  const endVerse = m[5] ? Number(m[5]) : startVerse;
  return { book, startCh, startVerse, endCh, endVerse };
};

const formatRef = (m: Match): string =>
  m.startCh === m.endCh
    ? `${m.book} ${m.startCh}:${m.startVerse}-${m.endVerse}`
    : `${m.book} ${m.startCh}:${m.startVerse}-${m.endCh}:${m.endVerse}`;

type BulletinItem = { idx: string; title: string; dateKey: string };
type AttachmentEntry = { href: string; name: string | null };
type PostDetail = { body: string; attachments: AttachmentEntry[]; misbaUrl: string | null };

// Supabase KV 기반 영속 캐시 — 람다 간 공유.
const listCache = makeKvCache<BulletinItem[]>('bulletin_list_cache_v1', LIST_TTL);
const detailCache = makeKvCache<PostDetail>('bulletin_detail_cache_v1', DETAIL_TTL);

const fetchBulletinList = async (): Promise<BulletinItem[]> => {
  const cached = await listCache.get('default');
  if (cached) return cached;
  const res = await fetch(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const items: BulletinItem[] = [];
  const re = /idx=(\d+)[^"]*"[\s\S]{0,2000}?<span[^>]*>\s*([^<]{3,100})\s*<\/span>/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const idx = m[1];
    if (seen.has(idx)) continue;
    seen.add(idx);
    const title = decodeEntities(m[2]).trim();
    if (!/주보/.test(title)) continue;
    const dm = title.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (!dm) continue;
    const dateKey = `${dm[1]}-${pad(Number(dm[2]))}-${pad(Number(dm[3]))}`;
    items.push({ idx, title, dateKey });
  }
  await listCache.set('default', items);
  return items;
};

// 게시글 본문 + 첨부파일 + 미스바 링크 파싱. bulletin-file.ts 와 동일한 로직을 수행해
// 클라이언트가 sunday-bulletin 응답만으로 화면을 구성할 수 있게 한다.
const fetchPost = async (idx: string): Promise<PostDetail> => {
  const cached = await detailCache.get(idx);
  if (cached) return cached;

  const res = await fetch(POST_URL(idx), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const bodyMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>/);
  const body = bodyMatch ? stripTags(decodeEntities(bodyMatch[1])) : '';

  const attachments: AttachmentEntry[] = [];
  const seen = new Set<string>();
  const attRe = /<a[^>]*href="(\/post_file_download\.cm\?c=[^"]+)"[^>]*>[\s\S]{0,200}?<p[^>]*class="tit"[^>]*>\s*([^<]+?)\s*<\/p>/g;
  let am: RegExpExecArray | null;
  while ((am = attRe.exec(html)) !== null) {
    const href = decodeEntities(am[1]);
    if (seen.has(href)) continue;
    seen.add(href);
    attachments.push({ href, name: decodeEntities(am[2]).trim() });
  }

  // 첨부 링크가 없으면 본문 내 삽입 <img> 를 대체로 사용 (주보가 이미지로 게시된 경우)
  if (attachments.length === 0) {
    const bodyHtmlMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>/);
    const bodyHtml = bodyHtmlMatch ? bodyHtmlMatch[1] : html;
    const imgRe = /<img[^>]+src="([^"]+)"/g;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(bodyHtml)) !== null) {
      const src = decodeEntities(im[1]);
      if (src.startsWith('data:')) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      const nameMatch = src.match(/[^/]+$/);
      attachments.push({ href: src, name: nameMatch ? nameMatch[0].split('?')[0] : null });
    }
  }

  // 미스바 링크 추출 — 본문 anchor 중 URL/텍스트에 misba/미스바/mizpah 포함
  let misbaUrl: string | null = null;
  const bodyForLinksMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
  const bodyForLinks = bodyForLinksMatch ? bodyForLinksMatch[1] : html;
  const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const candidates: string[] = [];
  let a: RegExpExecArray | null;
  while ((a = anchorRe.exec(bodyForLinks)) !== null) {
    const url = decodeEntities(a[1]);
    const text = decodeEntities(a[2].replace(/<[^>]+>/g, '')).trim();
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) continue;
    if (/misba|미스바|mizpah/i.test(url) || /미스바|misba|mizpah/i.test(text)) candidates.push(url);
  }
  if (candidates.length > 0) misbaUrl = candidates[candidates.length - 1];

  const data: PostDetail = { body, attachments, misbaUrl };
  await detailCache.set(idx, data);
  return data;
};

const extractFromText = (text: string): Match | null => {
  if (!text) return null;
  const m1 = text.match(SCRIPTURE_RE);
  if (m1) return parseMatch(m1);
  return null;
};

const extractFromFilename = (name: string): Match | null => {
  if (!name) return null;
  const m = name.match(PAREN_REF_RE);
  if (m) return parseMatch(m);
  return null;
};

const extractFromPdf = async (href: string): Promise<Match | null> => {
  try {
    const url = `https://koreanchurch.sg${href.replace(/&amp;/g, '&')}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    return extractFromText(parsed.text || '');
  } catch {
    return null;
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD 필수' });

    const bulletins = await fetchBulletinList();
    const match = bulletins.find((b) => b.dateKey === date);
    if (!match) {
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400');
      return res.status(200).json({ found: false, date });
    }

    const post = await fetchPost(match.idx);
    const files = post.attachments.map((e, i) => ({ n: i, name: e.name, mime: guessMime(e.name) }));

    // 1) 본문 텍스트에서 성경봉독 매칭
    let parsed = extractFromText(post.body);

    // 2) 첨부 파일명에서 (책 N:V-V) 패턴
    if (!parsed) {
      for (const att of post.attachments) {
        const m = extractFromFilename(att.name || '');
        if (m) { parsed = m; break; }
      }
    }

    // 3) PDF 첨부라면 텍스트 추출해서 매칭
    if (!parsed) {
      for (const att of post.attachments) {
        if (!/\.pdf$/i.test(att.name || '')) continue;
        const m = await extractFromPdf(att.href);
        if (m) { parsed = m; break; }
      }
    }

    // CDN + 브라우저 캐시: 30분 fresh, 24시간 stale-while-revalidate (edge 재사용으로 함수 호출 자체 최소화)
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400');

    if (!parsed) {
      return res.status(200).json({
        found: true,
        bulletinIdx: match.idx,
        bulletinTitle: match.title,
        reference: null,
        bibleText: null,
        bibleTextEn: null,
        files,
        misbaUrl: post.misbaUrl,
        reason: 'scripture-not-found',
      });
    }

    const reference = formatRef(parsed);
    const [koV, enV] = await Promise.all([
      lookupPassage(reference, 'ko').catch(() => []),
      lookupPassage(reference, 'en').catch(() => []),
    ]);
    const bibleText = koV.length > 0 ? formatVerses(koV, true) : null;
    const bibleTextEn = enV.length > 0 ? formatVerses(enV, true) : null;

    return res.status(200).json({
      found: true,
      bulletinIdx: match.idx,
      bulletinTitle: match.title,
      reference,
      bibleText,
      bibleTextEn,
      files,
      misbaUrl: post.misbaUrl,
    });
  } catch (e: any) {
    console.error('[sunday-bulletin]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
}
