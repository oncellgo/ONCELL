import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupPassage, formatVerses } from '../../lib/bible';

/**
 * 임의의 성경구절 참조로 개역한글 본문 조회.
 * GET /api/bible-text?ref=요한복음+20장+1-14절
 *   → { found, text, verses }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    if (!ref) return res.status(400).json({ error: 'ref 필요' });
    const verses = await lookupPassage(ref);
    if (verses.length === 0) return res.status(200).json({ found: false, ref });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      found: true,
      ref,
      text: formatVerses(verses, true),
      count: verses.length,
    });
  } catch (e) {
    console.error('[bible-text]', e);
    return res.status(500).json({ error: 'failed' });
  }
};

export default handler;
