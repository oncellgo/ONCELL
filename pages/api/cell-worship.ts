import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupPassage, formatVerses } from '../../lib/bible';
// pdf-parse v2: new PDFParse({ data: buffer }).getText()
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } };

// 약식 → 정식 책명
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
  요일: '요한일서', 요이: '요한이서', 요삼: '요한삼서', 유: '유다서',
  계: '요한계시록',
};

const normalizeBibleRef = (ref: string): string => {
  const m = ref.trim().match(/^([가-힣]{1,3})\s*(.+)$/);
  if (!m) return ref;
  const book = BOOK_ABBR[m[1]] || m[1];
  return `${book} ${m[2]}`;
};

// PDF 텍스트에서 찬송가 정보 추출 — "☞ 죄짐 맡은 우리 구주(찬송 369장)" 같은 패턴
const parseHymn = (text: string): { number: string; title: string | null } | null => {
  if (!text) return null;
  // 괄호 앞 제목 + 괄호 안 "찬송 N장" / "찬송가 N장" 형태
  const m = text.match(/([가-힣A-Za-z0-9 .,'"!?·]+)\s*\(\s*찬송가?\s*(\d{1,3})\s*장\s*\)/);
  if (m) {
    const title = m[1].replace(/^[☞▶◇▪◆►•\s*]+/, '').trim();
    return { number: m[2], title: title || null };
  }
  // 제목 없이 "찬송가 N장"만
  const m2 = text.match(/찬송가?\s*(\d{1,3})\s*장/);
  if (m2) return { number: m2[1], title: null };
  return null;
};

// PDF 텍스트를 내용나눔(Q)·기도 섹션으로 분리
const parsePdfSections = (text: string): { questions: string[]; prayer: Array<{ label: string; text: string }> } => {
  const out = { questions: [] as string[], prayer: [] as Array<{ label: string; text: string }> };
  if (!text) return out;

  // 페이지 푸터(`-- N of N --`) 제거
  const clean = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();

  // 내용 나눔(Witness) 섹션만 대상 — "말씀으로 삽시다" 이후 "나눔기도/삶_" 전까지
  const startIdx = clean.search(/말씀으로\s*삽시다|Witness/);
  const endIdx = clean.search(/나\s*눔\s*기\s*도|삶\s*[_＿]/);
  const witness = startIdx >= 0 ? clean.slice(startIdx, endIdx > startIdx ? endIdx : undefined) : '';

  // 질문: "N. ..." 으로 시작하고 "?" 또는 "습니까" / "입니까"로 끝나는 문장만
  if (witness) {
    const qRe = /(\d+)\.\s+([\s\S]*?)(?=\n\s*\d+\.\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = qRe.exec(witness)) !== null) {
      const q = m[2].replace(/\s+/g, ' ').trim();
      // 진짜 질문인지 검증 — 물음표로 끝나거나 ~니까로 끝남
      if (!/[?？]$/.test(q) && !/(니까|는가요|되나요|입니까|습니까)[\s?？]*$/.test(q)) continue;
      if (q.length < 8 || q.length > 500) continue;
      out.questions.push(`${m[1]}. ${q}`);
    }
  }

  // 삶_ / 공동체_ 기도
  const lifeMatch = clean.match(/삶\s*[_＿]+\s*([\s\S]*?)(?=공동체\s*[_＿]|$)/);
  if (lifeMatch) {
    const t = lifeMatch[1].replace(/\s+/g, ' ').trim();
    if (t.length > 10) out.prayer.push({ label: '삶', text: t });
  }
  const commMatch = clean.match(/공동체\s*[_＿]+\s*([\s\S]*)$/);
  if (commMatch) {
    const t = commMatch[1].replace(/\s+/g, ' ').trim();
    if (t.length > 10) out.prayer.push({ label: '공동체', text: t });
  }
  return out;
};

// ---------------------------------------------------------------
// 싱가폴한인교회 공지 게시판에서 "N월 M째 주_금요 구역예배지" 게시글을 찾아
// 해당 주일(Nth Sunday of month)과 매칭시킴.
// GET /api/cell-worship?date=YYYY-MM-DD → 그 주일에 맞는 게시글 본문 반환
// ---------------------------------------------------------------

const LIST_URL = 'https://koreanchurch.sg/noticeandnews';
const POST_URL = (idx: string) => `https://koreanchurch.sg/noticeandnews/?bmode=view&idx=${idx}&t=board`;
const CACHE_TTL = 30 * 60 * 1000;

type ListItem = { idx: string; title: string; dateKey: string; month: number; nth: number };
type BulletinItem = { idx: string; title: string; dateKey: string };

let listCache: { items: ListItem[]; bulletins: BulletinItem[]; at: number } | null = null;
const detailCache = new Map<string, { data: any; at: number }>();

const ORDINAL_MAP: Record<string, number> = { '첫': 1, '둘': 2, '셋': 3, '넷': 4, '다섯': 5 };

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "M월 N째 주 구역예배지" 게시글 → 실제 사용되는 설교 주일 날짜
// 규칙: 해당 게시글은 그 주 금요일 구역모임용이고, 내용은 그 주 **월요일 이전의 주일**(=전주 일요일)을 다룬다.
// 예: "4월 둘째 주 구역예배지"(4월 둘째 주 금요일 ≈ 4/10)는 "4월 첫째 주일"(4/5)의 설교를 다룸.
// 따라서 N번째 주일에서 한 주(7일) 전으로 당긴다.
const nthSundayOf = (year: number, month: number, nth: number): string | null => {
  const first = new Date(year, month - 1, 1);
  const shift = (7 - first.getDay()) % 7;
  const day = 1 + shift + (nth - 1) * 7;
  const original = new Date(year, month - 1, day);
  if (original.getMonth() !== month - 1) return null;
  // 한 주 전 주일로 이동 (설교 주일)
  const sermonSun = new Date(original);
  sermonSun.setDate(original.getDate() - 7);
  return toKey(sermonSun);
};

const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const stripTags = (s: string): string =>
  s.replace(/<\/?(?:p|br|div|span)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n\n').trim();

// 게시글 목록 파싱: idx + 제목 추출 후 '구역예배지' + '주보' 두 타입 분류
const fetchList = async (year: number): Promise<{ items: ListItem[]; bulletins: BulletinItem[] }> => {
  const now = Date.now();
  if (listCache && now - listCache.at < CACHE_TTL) return { items: listCache.items, bulletins: listCache.bulletins };

  const res = await fetch(LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const items: ListItem[] = [];
  const bulletins: BulletinItem[] = [];
  const re = /idx=(\d+)[^"]*"[\s\S]{0,2000}?<span[^>]*>\s*([^<]{3,100})\s*<\/span>/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const idx = m[1];
    if (seen.has(idx)) continue;
    const rawTitle = decodeEntities(m[2]).trim();
    seen.add(idx);

    // 1) 구역예배지 — "M월 N째 주 ... 구역예배지"
    if (/구역예배지/.test(rawTitle)) {
      const monthMatch = rawTitle.match(/(\d+)월/);
      const nthMatch = rawTitle.match(/([첫둘셋넷다섯])째/);
      if (!monthMatch || !nthMatch) continue;
      const month = Number(monthMatch[1]);
      const nth = ORDINAL_MAP[nthMatch[1]] || 0;
      if (!month || !nth) continue;
      const dateKey = nthSundayOf(year, month, nth);
      if (!dateKey) continue;
      items.push({ idx, title: rawTitle, dateKey, month, nth });
      continue;
    }

    // 2) 주보 — "YYYY년 M월 D일 주보 ..."
    if (/주보/.test(rawTitle)) {
      const dm = rawTitle.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      if (!dm) continue;
      const dateKey = `${dm[1]}-${pad(Number(dm[2]))}-${pad(Number(dm[3]))}`;
      bulletins.push({ idx, title: rawTitle, dateKey });
    }
  }
  listCache = { items, bulletins, at: now };
  return { items, bulletins };
};

// 게시글 본문 파싱 + 첨부 PDF 다운로드 및 텍스트 추출
const fetchDetail = async (idx: string): Promise<{ body: string; attachmentName: string | null; biblePassage: string | null; sermonTitle: string | null; pdfText: string | null }> => {
  const now = Date.now();
  const hit = detailCache.get(idx);
  if (hit && now - hit.at < CACHE_TTL) return hit.data;

  const res = await fetch(POST_URL(idx), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  // 게시글 기도문 본문 (참고용)
  const bodyMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>/);
  const body = bodyMatch ? stripTags(decodeEntities(bodyMatch[1])) : '';

  // 첨부파일 링크 + 파일명
  // 예: <a href="/post_file_download.cm?c=..." target="_blank"><p class="tit">FILENAME.pdf</p>...
  const attBlockMatch = html.match(/<a[^>]*href="(\/post_file_download\.cm\?c=[^"]+)"[^>]*>\s*<p class="tit">\s*([^<]+)\s*<\/p>/);
  const downloadPath = attBlockMatch ? attBlockMatch[1] : null;
  const attachmentName = attBlockMatch ? decodeEntities(attBlockMatch[2]).trim() : null;

  // 파일명에서 성경구절 / 설교제목 추출
  let biblePassage: string | null = null;
  let sermonTitle: string | null = null;
  if (attachmentName) {
    const bm = attachmentName.match(/\(([^()]+)\)/);
    if (bm) biblePassage = bm[1].replace(/\s+/g, ' ').trim();
    const sm = attachmentName.match(/\)\s*([^.]+?)\s*\.pdf/i);
    if (sm) sermonTitle = sm[1].trim();
  }

  // PDF 다운로드 + 텍스트 추출 — 실패 이유를 응답에 포함해 silent failure 방지
  let pdfText: string | null = null;
  let pdfError: string | null = null;
  if (!downloadPath) {
    pdfError = 'no-attachment-link';
  } else {
    try {
      const pdfUrl = `https://koreanchurch.sg${downloadPath.replace(/&amp;/g, '&')}`;
      const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!pdfRes.ok) {
        pdfError = `http-${pdfRes.status}`;
      } else {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        pdfText = (parsed.text || '').trim();
        if (!pdfText) pdfError = 'empty-text';
      }
    } catch (e: any) {
      pdfError = `parse-failed: ${e?.message || 'unknown'}`;
      console.error('[cell-worship] pdf parse failed:', e);
    }
  }

  // 성경 본문 조회 (개역한글 + KJV 둘 다)
  let bibleText: string | null = null;
  let bibleTextEn: string | null = null;
  let normalizedRef: string | null = null;
  if (biblePassage) {
    normalizedRef = normalizeBibleRef(biblePassage);
    try {
      const [koV, enV] = await Promise.all([
        lookupPassage(normalizedRef, 'ko'),
        lookupPassage(normalizedRef, 'en'),
      ]);
      if (koV.length > 0) bibleText = formatVerses(koV, true);
      if (enV.length > 0) bibleTextEn = formatVerses(enV, true);
    } catch {}
  }

  // PDF 섹션 파싱 (내용 나눔 · 기도 · 찬송가)
  const sections = pdfText ? parsePdfSections(pdfText) : { questions: [], prayer: [] };
  const hymn = pdfText ? parseHymn(pdfText) : null;

  const data = { body, attachmentName, biblePassage, normalizedRef, sermonTitle, pdfText, pdfError, bibleText, bibleTextEn, hymn, questions: sections.questions, prayer: sections.prayer };
  detailCache.set(idx, { data, at: now });
  return data;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD 필수' });
    const year = Number(date.slice(0, 4));
    const { items, bulletins } = await fetchList(year);
    const bulletinMatch = bulletins.find((b) => b.dateKey === date);
    const match = items.find((x) => x.dateKey === date);
    if (!match) return res.status(200).json({ found: false, bulletinIdx: bulletinMatch?.idx || null, bulletinTitle: bulletinMatch?.title || null });
    const detail = await fetchDetail(match.idx);
    return res.status(200).json({
      found: true,
      title: match.title,
      idx: match.idx,
      sundayDate: match.dateKey,
      bulletinIdx: bulletinMatch?.idx || null,
      bulletinTitle: bulletinMatch?.title || null,
      ...detail,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'failed' });
  }
}
