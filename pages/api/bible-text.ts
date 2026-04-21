import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupPassage, formatVerses } from '../../lib/bible';

/**
 * 성경 본문 조회 — 한글(개역한글)·영문(KJV) 중 하나 또는 양쪽 반환.
 * GET /api/bible-text?ref=요한복음+20장+1-14절&lang=ko|en|both  (기본 both)
 *   → { found, ref, ko?: {text, count}, en?: {text, count} }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const langParam = typeof req.query.lang === 'string' ? req.query.lang : 'both';
    if (!ref) return res.status(400).json({ error: 'ref 필요' });

    const wantKo = langParam === 'ko' || langParam === 'both';
    const wantEn = langParam === 'en' || langParam === 'both';

    const [koVerses, enVerses] = await Promise.all([
      wantKo ? lookupPassage(ref, 'ko') : Promise.resolve([]),
      wantEn ? lookupPassage(ref, 'en') : Promise.resolve([]),
    ]);

    const ko = wantKo && koVerses.length > 0
      ? { text: formatVerses(koVerses, true), count: koVerses.length }
      : null;
    const en = wantEn && enVerses.length > 0
      ? { text: formatVerses(enVerses, true), count: enVerses.length }
      : null;

    const found = !!(ko || en);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ found, ref, ko, en });
  } catch (e) {
    console.error('[bible-text]', e);
    return res.status(500).json({ error: 'failed' });
  }
};

export default handler;
