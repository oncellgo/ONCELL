import type { NextApiRequest, NextApiResponse } from 'next';
import { isCellMember } from '../../lib/cells';
import { db } from '../../lib/db';
import { getSGTodayKey } from '../../lib/events';
import { requireSession } from '../../lib/session';

/**
 * 셀에 큐티 묵상 공개(공유) 토글.
 *   POST   { profileId, cellId, mode:'qt', date, visibility:'full'|'feelings' }
 *   DELETE ?profileId=&cellId=&mode=qt&date=
 *
 * 규칙: 셀 멤버만. qt는 SG 당일(getSGTodayKey)만 공유 가능 + 오늘 노트 존재 필수(비어있는 인증 방지).
 * 공유 행이 없으면 = 비공개 참여(완료 카운트는 되고 내용만 숨김).
 */

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const VISIBILITY = new Set(['full', 'feelings']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 내가 특정 날짜에 어느 셀에 공개했는지 (작성 후 셀 선택 UI 용)
  if (req.method === 'GET') {
    const profileId = requireSession(req, res);
    if (!profileId) return;
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    const mode = typeof req.query.mode === 'string' ? req.query.mode : 'qt';
    if (!DATE_RX.test(date)) return res.status(400).json({ error: 'date 필수' });
    try {
      const { data, error } = await db.from('oncell_cell_shares').select('cell_id, visibility')
        .eq('profile_id', profileId).eq('mode', mode).eq('date', date);
      if (error) return res.status(500).json({ error: 'query failed', errorReason: error.message });
      return res.status(200).json({ shares: (data || []).map((r: any) => ({ cellId: r.cell_id, visibility: r.visibility })) });
    } catch (e: any) {
      console.error('[cell-shares] GET failed', e);
      return res.status(500).json({ error: 'query failed', errorReason: e?.message || String(e) });
    }
  }

  if (req.method === 'POST') {
    const profileId = requireSession(req, res);
    if (!profileId) return;
    const { cellId, mode, date, visibility } = (req.body || {}) as {
      cellId?: string; mode?: string; date?: string; visibility?: string;
    };
    if (!cellId) return res.status(400).json({ error: 'cellId required' });
    if (mode !== 'qt') return res.status(400).json({ error: 'qt만 지원' });
    if (!date || !DATE_RX.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD' });
    const vis = VISIBILITY.has(visibility || '') ? (visibility as string) : 'full';

    // 큐티: SG 당일만
    const today = getSGTodayKey();
    if (date !== today) return res.status(400).json({ error: `오늘(${today}) 큐티만 공유할 수 있습니다.` });

    try {
      if (!(await isCellMember(cellId, profileId))) return res.status(403).json({ error: 'not a member' });

      // 오늘 노트 존재 확인 (작성 필수)
      const { data: note } = await db.from('oncell_qt_notes').select('profile_id').eq('profile_id', profileId).eq('date', date).maybeSingle();
      if (!note) return res.status(400).json({ error: 'no_note', errorReason: '먼저 오늘 큐티를 작성해주세요.' });

      const { error } = await db.from('oncell_cell_shares').upsert(
        { cell_id: cellId, profile_id: profileId, mode, date, visibility: vis },
        { onConflict: 'cell_id,profile_id,mode,date' },
      );
      if (error) return res.status(500).json({ error: 'share failed', errorReason: error.message });
      return res.status(200).json({ ok: true, visibility: vis });
    } catch (e: any) {
      console.error('[cell-shares] POST failed', e);
      return res.status(500).json({ error: 'share failed', errorReason: e?.message || String(e) });
    }
  }

  if (req.method === 'DELETE') {
    const profileId = requireSession(req, res);
    if (!profileId) return;
    const cellId = typeof req.query.cellId === 'string' ? req.query.cellId : '';
    const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!cellId || mode !== 'qt' || !DATE_RX.test(date)) return res.status(400).json({ error: 'cellId, mode=qt, date 필수' });
    try {
      // 공유 행 삭제 → share_reactions 는 복합 FK cascade 로 함께 삭제
      const { error } = await db.from('oncell_cell_shares').delete()
        .eq('cell_id', cellId).eq('profile_id', profileId).eq('mode', mode).eq('date', date);
      if (error) return res.status(500).json({ error: 'unshare failed', errorReason: error.message });
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error('[cell-shares] DELETE failed', e);
      return res.status(500).json({ error: 'unshare failed', errorReason: e?.message || String(e) });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
