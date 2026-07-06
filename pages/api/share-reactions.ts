import type { NextApiRequest, NextApiResponse } from 'next';
import { isCellMember } from '../../lib/cells';
import { db } from '../../lib/db';
import { requireSession } from '../../lib/session';

/**
 * 공유된 묵상에 셀원 반응(좋아요 등) 토글.
 *   POST   { profileId(=반응자), cellId, authorProfileId, mode:'qt', date, reaction }
 *   DELETE ?profileId=&cellId=&authorProfileId=&mode=qt&date=&reaction=
 *
 * 규칙: 반응자는 셀 멤버여야 하고, 대상은 실제로 공유된(oncell_cell_shares) 묵상이어야 함.
 */

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const REACTIONS = new Set(['like', 'amen', 'pray']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const profileId = requireSession(req, res);
    if (!profileId) return;
    const { cellId, authorProfileId, mode, date, reaction } = (req.body || {}) as {
      cellId?: string; authorProfileId?: string; mode?: string; date?: string; reaction?: string;
    };
    if (!cellId || !authorProfileId) return res.status(400).json({ error: 'cellId, authorProfileId required' });
    if (mode !== 'qt') return res.status(400).json({ error: 'qt만 지원' });
    if (!date || !DATE_RX.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD' });
    if (!REACTIONS.has(reaction || '')) return res.status(400).json({ error: 'invalid reaction' });

    try {
      if (!(await isCellMember(cellId, profileId))) return res.status(403).json({ error: 'not a member' });

      // 대상이 실제 공유된 묵상인지 확인
      const { data: share } = await db.from('oncell_cell_shares').select('profile_id')
        .eq('cell_id', cellId).eq('profile_id', authorProfileId).eq('mode', mode).eq('date', date).maybeSingle();
      if (!share) return res.status(400).json({ error: 'not_shared', errorReason: '공유된 묵상에만 반응할 수 있습니다.' });

      const { error } = await db.from('oncell_share_reactions').upsert(
        { cell_id: cellId, author_profile_id: authorProfileId, mode, date, reactor_profile_id: profileId, reaction },
        { onConflict: 'cell_id,author_profile_id,mode,date,reactor_profile_id,reaction' },
      );
      if (error) return res.status(500).json({ error: 'react failed', errorReason: error.message });
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error('[share-reactions] POST failed', e);
      return res.status(500).json({ error: 'react failed', errorReason: e?.message || String(e) });
    }
  }

  if (req.method === 'DELETE') {
    const profileId = requireSession(req, res);
    if (!profileId) return;
    const q = req.query;
    const cellId = typeof q.cellId === 'string' ? q.cellId : '';
    const authorProfileId = typeof q.authorProfileId === 'string' ? q.authorProfileId : '';
    const mode = typeof q.mode === 'string' ? q.mode : '';
    const date = typeof q.date === 'string' ? q.date : '';
    const reaction = typeof q.reaction === 'string' ? q.reaction : '';
    if (!profileId || !cellId || !authorProfileId || mode !== 'qt' || !DATE_RX.test(date) || !REACTIONS.has(reaction)) {
      return res.status(400).json({ error: '필수 파라미터 누락' });
    }
    try {
      const { error } = await db.from('oncell_share_reactions').delete()
        .eq('cell_id', cellId).eq('author_profile_id', authorProfileId).eq('mode', mode).eq('date', date)
        .eq('reactor_profile_id', profileId).eq('reaction', reaction);
      if (error) return res.status(500).json({ error: 'unreact failed', errorReason: error.message });
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error('[share-reactions] DELETE failed', e);
      return res.status(500).json({ error: 'unreact failed', errorReason: e?.message || String(e) });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
