import type { NextApiRequest, NextApiResponse } from 'next';

// 주보 게시글(idx)의 첨부파일을 프록시 스트리밍하거나 목록을 조회한다.
// - GET /api/bulletin-file?idx=XXX          → { files: [{n, name, mime?}] }
// - GET /api/bulletin-file?idx=XXX&n=0     → 첨부 바이너리 스트리밍

const POST_URL = (idx: string) => `https://koreanchurch.sg/noticeandnews/?bmode=view&idx=${idx}&t=board`;
const BASE = 'https://koreanchurch.sg';
const CACHE_TTL = 30 * 60 * 1000;

type Entry = { href: string; name: string | null };
type ParsedPost = { entries: Entry[]; misbaUrl: string | null };

const listCache = new Map<string, { at: number; parsed: ParsedPost }>();

const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

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

const fetchAttachments = async (idx: string): Promise<ParsedPost> => {
  const hit = listCache.get(idx);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL) return hit.parsed;

  const res = await fetch(POST_URL(idx), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const entries: Entry[] = [];
  const seen = new Set<string>();

  // 1) 표준 첨부파일 다운로드 링크 — <a href="/post_file_download.cm?c=..."><p class="tit">FILENAME</p>
  const attRe = /<a[^>]*href="(\/post_file_download\.cm\?c=[^"]+)"[^>]*>[\s\S]{0,200}?<p[^>]*class="tit"[^>]*>\s*([^<]+?)\s*<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = attRe.exec(html)) !== null) {
    const href = decodeEntities(m[1]);
    if (seen.has(href)) continue;
    seen.add(href);
    entries.push({ href, name: decodeEntities(m[2]).trim() });
  }

  // 2) 본문에 삽입된 img 태그 (주보 이미지가 본문에 바로 첨부된 경우)
  if (entries.length === 0) {
    const bodyMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>/);
    const body = bodyMatch ? bodyMatch[1] : html;
    const imgRe = /<img[^>]+src="([^"]+)"/g;
    while ((m = imgRe.exec(body)) !== null) {
      const src = decodeEntities(m[1]);
      if (src.startsWith('data:')) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      const nameMatch = src.match(/[^/]+$/);
      entries.push({ href: src, name: nameMatch ? nameMatch[0].split('?')[0] : null });
    }
  }

  // 3) 게시물 본문에 삽입된 "미스바" 링크 추출 — anchor의 text나 href가 misba/미스바 포함.
  //    게시글 하단에 미스바 앱/파일 링크가 있는 경우 우선 사용.
  let misbaUrl: string | null = null;
  const bodyMatch = html.match(/<div class="margin-top-xxl _comment_body_[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
  const body = bodyMatch ? bodyMatch[1] : html;
  const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let a: RegExpExecArray | null;
  const candidates: Array<{ url: string; text: string }> = [];
  while ((a = anchorRe.exec(body)) !== null) {
    const url = decodeEntities(a[1]);
    const text = decodeEntities(a[2].replace(/<[^>]+>/g, '')).trim();
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) continue;
    if (/misba|미스바|mizpah/i.test(url) || /미스바|misba|mizpah/i.test(text)) {
      candidates.push({ url, text });
    }
  }
  // 후보 중 가장 마지막(게시물 하단에 가까운) 링크 사용
  if (candidates.length > 0) misbaUrl = candidates[candidates.length - 1].url;

  const parsed: ParsedPost = { entries, misbaUrl };
  listCache.set(idx, { at: now, parsed });
  return parsed;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const idx = typeof req.query.idx === 'string' ? req.query.idx : '';
  if (!/^\d+$/.test(idx)) return res.status(400).json({ error: 'idx 필수' });

  try {
    const parsed = await fetchAttachments(idx);
    const entries = parsed.entries;

    // 목록 조회 모드
    if (req.query.n === undefined) {
      return res.status(200).json({
        idx,
        count: entries.length,
        files: entries.map((e, i) => ({ n: i, name: e.name, mime: guessMime(e.name) })),
        misbaUrl: parsed.misbaUrl,
      });
    }

    // 파일 스트리밍 모드
    const n = Number(req.query.n);
    if (!Number.isFinite(n) || n < 0 || n >= entries.length) {
      return res.status(404).json({ error: 'not-found' });
    }
    const entry = entries[n];
    const fileUrl = entry.href.startsWith('http') ? entry.href : `${BASE}${entry.href}`;
    const fileRes = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: POST_URL(idx),
      },
    });
    if (!fileRes.ok) {
      return res.status(fileRes.status).json({ error: `http-${fileRes.status}` });
    }

    const upstreamMime = fileRes.headers.get('content-type');
    const mime = upstreamMime && !/text\/html/i.test(upstreamMime) ? upstreamMime : guessMime(entry.name);
    const buf = Buffer.from(await fileRes.arrayBuffer());
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (e: any) {
    console.error('[bulletin-file]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
}
