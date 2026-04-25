import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 성경 장별 사전 녹음 오디오 URL 조회.
 *
 * GET /api/bible-audio?book=창세기&chapter=1&voice=ko-KR-Wavenet-B
 *   → { url, exists: true }   (사전 녹음 있음 — 직접 재생)
 *   → { url: null, exists: false }  (없음 — 클라이언트가 /api/tts 로 fallback)
 *
 * 데이터: Supabase Storage 'bible-tts' (public bucket)
 *        path: {voice}/{bookSlug}/{chapter}.mp3
 *
 * 캐시: 사전 녹음은 변하지 않으므로 1년 immutable. CDN 캐시 적극 활용.
 */

const BUCKET = 'bible-tts';

// 책 한글명 → 슬러그 (scripts/generate-bible-tts.mjs 와 동일)
const SLUG: Record<string, string> = {
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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const book = typeof req.query.book === 'string' ? req.query.book.trim() : '';
  const chapterRaw = typeof req.query.chapter === 'string' ? req.query.chapter : '';
  const chapter = parseInt(chapterRaw, 10);
  const voice = typeof req.query.voice === 'string' && req.query.voice.trim()
    ? req.query.voice.trim()
    : 'ko-KR-Wavenet-B';

  if (!book || !SLUG[book]) return res.status(400).json({ error: `unknown book: ${book}` });
  if (!Number.isInteger(chapter) || chapter < 1) return res.status(400).json({ error: 'chapter must be positive integer' });

  const slug = SLUG[book];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return res.status(503).json({ error: 'supabase not configured' });

  // public 버킷이면 정해진 URL 패턴
  // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(voice)}/${slug}/${chapter}.mp3`;

  // exists 체크는 비용 → 클라이언트가 <audio onError> 로 fallback 처리하는 게 효율적.
  // 다만 명시적 확인 원하면 ?check=1 로 HEAD 요청.
  const wantCheck = req.query.check === '1';
  let exists: boolean | null = null;
  if (wantCheck) {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      exists = head.ok;
    } catch {
      exists = false;
    }
  }

  // CDN 1년 immutable — 사전 녹음 본문은 변경 없음
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
  return res.status(200).json({ url, exists, voice, book, chapter });
};

export default handler;
