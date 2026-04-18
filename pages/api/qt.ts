import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupPassage, formatVerses } from '../../lib/bible';
import { kvGet, kvSet } from '../../lib/db';

const SOURCE_URL = 'https://sum.su.or.kr:8888/bible/today';
const AJAX_BIBLE_URL = 'https://sum.su.or.kr:8888/Ajax/Bible/BodyBible';

// 개역한글 66권 표준 순서 (매일성경 Bible_Code와 일치)
const BOOK_CODE_NAMES: Record<number, string> = {
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

type QtResult = {
  reference: string | null;
  passage: string | null;       // 매일성경 해설 텍스트
  passageText: string | null;   // 개역한글 성경 본문 (번들에서 조회)
  hymn: { number: string; title: string | null } | null;
  audioUrl: string | null;
  title: string | null;
  source: string;
  fetchedAt: string;
  error?: string;
};

let cache: { data: QtResult; at: number } | null = null;
const dateCache = new Map<string, { data: QtResult; at: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30;

// 영구 캐시(Supabase app_kv) — cold start에도 유지.
// 성경 본문/구절은 날짜별로 확정되므로 무기한 캐시 가능.
const kvKeyFor = (date: string) => `qt_${date}`;
const getKvQt = async (date: string): Promise<QtResult | null> => {
  try { return await kvGet<QtResult>(kvKeyFor(date)); } catch { return null; }
};
const setKvQt = async (date: string, data: QtResult): Promise<void> => {
  try { await kvSet(kvKeyFor(date), data); } catch {}
};

// 오늘 날짜 YYYY-MM-DD (Asia/Seoul 기준 — 매일성경 서버 시각대와 일치)
const todayKeySeoul = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  const d = parts.find((p) => p.type === 'day')?.value || '';
  return `${y}-${m}-${d}`;
};

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const pickMeta = (html: string, name: string): string | null => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1].trim()) : null;
};

const KOREAN_BOOKS = [
  '창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기',
  '사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더',
  '욥기','시편','잠언','전도서','아가',
  '이사야','예레미야','예레미야애가','에스겔','다니엘',
  '호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기',
  '마태복음','마가복음','누가복음','요한복음','사도행전',
  '로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서',
  '데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서',
  '히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록',
];

const findReference = (text: string): string | null => {
  const bookPattern = KOREAN_BOOKS.join('|');
  // 지원 형식:
  //   창세기 25:1-18
  //   창세기 25:1-25:18
  //   창세기(Genesis) 25:1-25:18
  //   창세기(Genesis)25:1-25:18
  //   창세기 25장 1-18절
  const optionalParen = '(?:\\s*\\([^)]*\\))?';
  const verseRange = '\\d{1,3}(?:\\s*[-~]\\s*\\d{1,3}(?::\\s*\\d{1,3})?)?';
  const re1 = new RegExp(
    `(${bookPattern})${optionalParen}\\s*\\d{1,3}\\s*(?:장\\s*${verseRange}\\s*절?|[:]\\s*${verseRange})`,
  );
  const m = text.match(re1);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  const re2 = new RegExp(`(${bookPattern})${optionalParen}\\s*\\d{1,3}\\s*장`);
  const m2 = text.match(re2);
  return m2 ? m2[0].replace(/\s+/g, ' ').trim() : null;
};

const findHymn = (text: string): { number: string; title: string | null } | null => {
  // 예: "찬송가 310장", "찬송 310장 내 평생 소원 이것뿐"
  const m = text.match(/찬송(?:가)?\s*제?\s*(\d{1,3})\s*장\s*([\u3131-\uD79D\s][^.\n<·]{0,40})?/);
  if (m) {
    const number = m[1];
    const titleRaw = (m[2] || '').replace(/[\s·…\-]+$/g, '').trim();
    const title = titleRaw && titleRaw.length > 1 && titleRaw.length < 40 ? titleRaw : null;
    return { number, title };
  }
  return null;
};

const absolutize = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://sum.su.or.kr:8888${url}`;
  return `https://sum.su.or.kr:8888/${url.replace(/^\.\//, '')}`;
};

const findAudio = (html: string): string | null => {
  // 1) "매일성경과 함께" 라벨 주변의 오디오 파일 우선
  const labelMatch = html.match(/매일\s*성경과\s*함께/);
  if (labelMatch && labelMatch.index !== undefined) {
    const start = Math.max(0, labelMatch.index - 1200);
    const end = Math.min(html.length, labelMatch.index + 1200);
    const win = html.slice(start, end);
    const abs = win.match(/https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac|ogg)(?:\?[^\s"'<>]*)?/i);
    if (abs) return abs[0];
    const rel = win.match(/["'](\/[^"'<>]+\.(?:mp3|m4a|aac|ogg)(?:\?[^"'<>]*)?)["']/i);
    if (rel) return absolutize(rel[1]);
  }
  // 2) <audio> / <source>
  const audioTag = html.match(/<audio[^>]*>[\s\S]*?<\/audio>/i);
  if (audioTag) {
    const srcAttr = audioTag[0].match(/src=["']([^"']+)["']/i);
    if (srcAttr) return absolutize(srcAttr[1]);
    const srcEl = audioTag[0].match(/<source[^>]+src=["']([^"']+)["']/i);
    if (srcEl) return absolutize(srcEl[1]);
  }
  // 3) 페이지 전체 내 최초 오디오 링크
  const anyAbs = html.match(/https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac|ogg)(?:\?[^\s"'<>]*)?/i);
  if (anyAbs) return anyAbs[0];
  const anyRel = html.match(/["'](\/[^"'<>]+\.(?:mp3|m4a|aac|ogg)(?:\?[^"'<>]*)?)["']/i);
  if (anyRel) return absolutize(anyRel[1]);
  return null;
};

const extractCommentaryText = (html: string): string | null => {
  // "해설" 탭 내부에서 본문으로 보이는 텍스트 블록을 추출.
  // 탭 마커 근처 ~3000자 윈도우를 잘라 본문 후보 텍스트로 사용.
  const idx = html.search(/해\s*설/);
  if (idx === -1) return null;
  const window = html.slice(idx, Math.min(html.length, idx + 4000));
  // 가장 긴 <div>/<p> 블록 하나를 뽑아 텍스트로 변환
  const blocks = window.match(/<(?:div|p|section|article)[^>]*>[\s\S]*?<\/(?:div|p|section|article)>/gi) || [];
  const texts = blocks
    .map((b) => stripTags(b))
    .filter((t) => t.length >= 40 && t.length <= 1200);
  texts.sort((a, b) => b.length - a.length);
  return texts[0] || null;
};

const fetchDateSpecific = async (dateStr: string): Promise<QtResult> => {
  const body = JSON.stringify({ qt_ty: 'A', Base_de: dateStr });
  const r = await fetch(AJAX_BIBLE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Mozilla/5.0 (compatible; Steward+AI/1.0)',
      Accept: 'application/json, text/javascript, */*',
    },
    body,
  });
  if (!r.ok) throw new Error(`Upstream ${r.status}`);
  const txt = await r.text();
  let rows: any[] = [];
  try {
    rows = JSON.parse(txt);
  } catch {
    throw new Error('Invalid upstream response');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      reference: null, passage: null, passageText: null,
      hymn: null, audioUrl: null, title: null,
      source: AJAX_BIBLE_URL, fetchedAt: new Date().toISOString(),
    };
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const bookName = BOOK_CODE_NAMES[first.Bible_Code] || null;
  let reference: string | null = null;
  if (bookName) {
    const sC = first.Chapter, sV = first.Verse, eC = last.Chapter, eV = last.Verse;
    reference = (sC === eC)
      ? `${bookName} ${sC}:${sV}-${eV}`
      : `${bookName} ${sC}:${sV}-${eC}:${eV}`;
  }
  let passageText: string | null = null;
  if (reference) {
    try {
      const verses = await lookupPassage(reference);
      if (verses.length > 0) passageText = formatVerses(verses);
    } catch {}
  }
  return {
    reference,
    passage: null,
    passageText,
    hymn: null,
    audioUrl: null,
    title: null,
    source: AJAX_BIBLE_URL,
    fetchedAt: new Date().toISOString(),
  };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=1800, stale-while-revalidate=3600');

  // 날짜 지정 모드: ?date=YYYY-MM-DD
  const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    // 1) 메모리 캐시 (warm invocation)
    const cached = dateCache.get(dateParam);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }
    // 2) 영구 캐시 (Supabase app_kv)
    const persisted = await getKvQt(dateParam);
    if (persisted && persisted.passageText) {
      dateCache.set(dateParam, { data: persisted, at: Date.now() });
      return res.status(200).json(persisted);
    }
    // 3) upstream fetch + 캐시 저장
    try {
      const data = await fetchDateSpecific(dateParam);
      if (data.passageText) {
        dateCache.set(dateParam, { data, at: Date.now() });
        await setKvQt(dateParam, data);
      }
      return res.status(200).json(data);
    } catch (error: any) {
      console.error(`QT fetch (date=${dateParam}) failed:`, error?.message || error);
      return res.status(200).json({
        reference: null, passage: null, passageText: null,
        hymn: null, audioUrl: null, title: null,
        source: AJAX_BIBLE_URL, fetchedAt: new Date().toISOString(),
        error: '해당 날짜의 말씀을 불러오지 못했습니다.',
      });
    }
  }

  // today 모드: 메모리 캐시 → 영구 캐시(오늘 날짜 키) → upstream 순
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return res.status(200).json(cache.data);
  }
  const todayKey = todayKeySeoul();
  const persistedToday = await getKvQt(todayKey);
  if (persistedToday && persistedToday.passageText) {
    cache = { data: persistedToday, at: Date.now() };
    return res.status(200).json(persistedToday);
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Steward+AI/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);

    const html = await response.text();
    const allText = stripTags(html);

    const ogTitle = pickMeta(html, 'og:title');
    const ogDescription = pickMeta(html, 'og:description');
    const metaDescription = pickMeta(html, 'description');

    const reference =
      findReference(allText) ||
      findReference(ogTitle || '') ||
      findReference(ogDescription || '');

    const commentary = extractCommentaryText(html);
    const hymn = findHymn(allText) || findHymn(commentary || '') || findHymn(ogDescription || '');
    const audioUrl = findAudio(html);

    const title = ogTitle || (metaDescription ? metaDescription.split(/[·\-|]/)[0].trim() : null);

    // 개역한글 번들에서 본문 조회 (없으면 null)
    let passageText: string | null = null;
    if (reference) {
      try {
        const verses = await lookupPassage(reference);
        if (verses.length > 0) passageText = formatVerses(verses);
      } catch {}
    }

    const data: QtResult = {
      reference,
      passage: commentary,
      passageText,
      hymn,
      audioUrl,
      title,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString(),
    };
    // passageText 조회에 실패했으면 캐시하지 않는다 (번들 캐시 워밍 이후 재시도되도록).
    if (!reference || passageText) {
      cache = { data, at: Date.now() };
      if (passageText) await setKvQt(todayKey, data);
    }
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('QT fetch failed:', error?.message || error);
    return res.status(200).json({
      reference: null,
      passage: null,
      passageText: null,
      hymn: null,
      audioUrl: null,
      title: null,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString(),
      error: '오늘의 말씀을 불러오지 못했습니다.',
    });
  }
};

export default handler;
