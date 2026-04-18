import { readFile } from 'fs/promises';
import path from 'path';

/**
 * 개역한글 성경 본문 조회 유틸.
 *
 * 아래 네 가지 JSON 포맷 중 무엇이든 `data/bible.json`에 넣으면 인식한다.
 *
 * A. 중첩 객체 (권장):
 *    { "books": { "창세기": { "1": { "1": "태초에…" } } } }
 *
 * B. 평면 배열 (짧은 키):
 *    { "verses": [{ "b": "창세기", "c": 1, "v": 1, "t": "태초에..." }] }
 *
 * C. 평면 배열 (긴 키):
 *    [{ "book": "창세기", "chapter": 1, "verse": 1, "text": "태초에..." }]
 *
 * D. 책 리스트:
 *    { "books": [{ "name": "창세기", "chapters": [{ "verses": [{ "number": 1, "text": "태초에..." }] }] }] }
 */

type Bundle = any;

let cache: { data: Map<string, Record<string, Record<string, string>>> | null; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

const loadBundle = async (): Promise<Map<string, Record<string, Record<string, string>>> | null> => {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const raw = await readFile(path.join(process.cwd(), 'data', 'bible.json'), 'utf8');
    const parsed: Bundle = JSON.parse(raw);
    const map = new Map<string, Record<string, Record<string, string>>>();

    const put = (book: string, c: number | string, v: number | string, t: string) => {
      if (!book || !c || !v || typeof t !== 'string') return;
      if (!map.has(book)) map.set(book, {});
      const chapters = map.get(book)!;
      const ck = String(c);
      if (!chapters[ck]) chapters[ck] = {};
      chapters[ck][String(v)] = t;
    };

    // A: { books: { 창세기: { "1": { "1": "..." } } } } (중첩 객체)
    if (parsed && typeof parsed === 'object' && parsed.books && !Array.isArray(parsed.books)) {
      for (const [book, chapters] of Object.entries(parsed.books as Record<string, any>)) {
        if (chapters && typeof chapters === 'object' && !Array.isArray(chapters)) {
          for (const [ch, verses] of Object.entries(chapters as Record<string, any>)) {
            if (verses && typeof verses === 'object') {
              for (const [vn, txt] of Object.entries(verses as Record<string, any>)) {
                put(book, ch, vn, String(txt));
              }
            }
          }
        }
      }
    }
    // D: { books: [{ name, chapters: [{ verses: [{ number, text }] }] }] }
    if (parsed && Array.isArray(parsed.books)) {
      for (const bk of parsed.books) {
        const bookName = bk?.name || bk?.book || bk?.title;
        const chapters = bk?.chapters;
        if (!bookName || !Array.isArray(chapters)) continue;
        chapters.forEach((chObj: any, chIdx: number) => {
          const chNum = chObj?.number || chObj?.chapter || (chIdx + 1);
          const verses = chObj?.verses || [];
          if (!Array.isArray(verses)) return;
          verses.forEach((ve: any, vIdx: number) => {
            const vNum = ve?.number || ve?.verse || (vIdx + 1);
            const txt = ve?.text || ve?.t;
            put(bookName, chNum, vNum, String(txt || ''));
          });
        });
      }
    }
    // B: { verses: [{ b, c, v, t }] }
    if (parsed && Array.isArray(parsed.verses)) {
      for (const row of parsed.verses) {
        put(row?.b, row?.c, row?.v, row?.t);
      }
    }
    // C: [{ book, chapter, verse, text }]
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        put(row?.book || row?.b, row?.chapter || row?.c, row?.verse || row?.v, row?.text || row?.t);
      }
    }

    if (map.size > 0) {
      cache = { data: map, at: now };
      return map;
    }
    // 번들을 읽었지만 비어있으면 캐시하지 않는다 (파일이 나중에 채워질 수 있음).
    return null;
  } catch {
    return null;
  }
};

const KOREAN_BOOKS = [
  '창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기',
  '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더',
  '욥기', '시편', '잠언', '전도서', '아가',
  '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘',
  '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기',
  '마태복음', '마가복음', '누가복음', '요한복음', '사도행전',
  '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서',
  '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서',
  '히브리서', '야고보서', '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서', '요한계시록',
];

export type ParsedReference = {
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  raw: string;
};

/**
 * Reference 문자열을 범위로 파싱.
 * 지원 포맷:
 *   "창세기 26:34"
 *   "창세기 26:34-48"
 *   "창세기 26:34-27:14"
 *   "창세기(Genesis) 26:34-27:14"
 *   "시편 23"           (장 전체)
 *   "창세기 26장 34-48절"
 */
export const parseReference = (ref: string): ParsedReference | null => {
  if (!ref || typeof ref !== 'string') return null;
  const cleaned = ref.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  const bookPattern = KOREAN_BOOKS.join('|');
  const bookMatch = new RegExp(`^(${bookPattern})\\s*(.*)$`).exec(cleaned);
  if (!bookMatch) return null;
  const book = bookMatch[1];
  const rest = (bookMatch[2] || '').trim();

  // "26장 34-48절" 형태
  const chapterVerseKorean = /^(\d{1,3})\s*장\s*(?:(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\s*절)?$/.exec(rest);
  if (chapterVerseKorean) {
    const c = Number(chapterVerseKorean[1]);
    const vStart = chapterVerseKorean[2] ? Number(chapterVerseKorean[2]) : 1;
    const vEnd = chapterVerseKorean[3] ? Number(chapterVerseKorean[3]) : (chapterVerseKorean[2] ? vStart : 200);
    return { book, startChapter: c, startVerse: vStart, endChapter: c, endVerse: vEnd, raw: ref };
  }

  // "26:34-27:14" 또는 "26:34-48" 또는 "26:34" 또는 "23" (장만)
  const m = /^(\d{1,3})(?::\s*(\d{1,3})(?:\s*[-~]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?)?$/.exec(rest);
  if (!m) return null;
  const startChapter = Number(m[1]);
  const startVerse = m[2] ? Number(m[2]) : 1;
  let endChapter = startChapter;
  let endVerse: number;
  if (m[3] && m[4]) {
    endChapter = Number(m[3]);
    endVerse = Number(m[4]);
  } else if (m[4]) {
    endVerse = Number(m[4]);
  } else if (m[2]) {
    endVerse = startVerse;
  } else {
    endVerse = 200; // 장 전체
  }
  return { book, startChapter, startVerse, endChapter, endVerse, raw: ref };
};

export type Verse = { chapter: number; verse: number; text: string };

/**
 * Reference 문자열에 해당하는 본문을 배열로 반환.
 * 번들이 비어있거나 해당 구절이 없으면 빈 배열.
 */
export const lookupPassage = async (reference: string): Promise<Verse[]> => {
  const parsed = parseReference(reference);
  if (!parsed) return [];
  const bundle = await loadBundle();
  if (!bundle) return [];
  const chapters = bundle.get(parsed.book);
  if (!chapters) return [];

  const out: Verse[] = [];
  for (let c = parsed.startChapter; c <= parsed.endChapter; c++) {
    const chapter = chapters[String(c)];
    if (!chapter) continue;
    const verseNums = Object.keys(chapter).map(Number).sort((a, b) => a - b);
    const vStart = c === parsed.startChapter ? parsed.startVerse : 1;
    const vEnd = c === parsed.endChapter ? parsed.endVerse : 200;
    for (const v of verseNums) {
      if (v >= vStart && v <= vEnd) {
        out.push({ chapter: c, verse: v, text: chapter[String(v)] });
      }
    }
  }
  return out;
};

/**
 * 조회된 Verse[]를 한 덩어리 텍스트로 포매팅.
 * 예: "34 에서가 사십세에... 35 그들이 이삭과..."
 */
export const formatVerses = (verses: Verse[], includeChapter = true): string => {
  if (verses.length === 0) return '';
  const parts: string[] = [];
  let lastChapter: number | null = null;
  for (const v of verses) {
    if (includeChapter && v.chapter !== lastChapter) {
      parts.push(`[${v.chapter}장]`);
      lastChapter = v.chapter;
    }
    parts.push(`${v.verse} ${v.text}`);
  }
  return parts.join('\n');
};
