import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellById, isCellMember, getCellMembers } from '../../../../lib/cells';
import { getProfiles } from '../../../../lib/dataStore';
import { db } from '../../../../lib/db';
import { requireSession } from '../../../../lib/session';

/**
 * 셀의 특정 날짜 큐티 현황 (완료·공유·내용·반응) 한 번에.
 * GET /api/cells/:id/today?profileId=X&date=YYYY-MM-DD
 *
 * 모델:
 *  - 참여(카운트·이름·✓) = oncell_user_completions(qt 완료). 셀 무관, 완료했으면 이 셀에도 카운트.
 *  - 내용 공개 = oncell_cell_shares 행(visibility). 행 없으면 비공개 참여(이름·✓만, 내용 숨김).
 *  - 반응 = oncell_share_reactions. 공유된 항목에만. 셀 멤버만.
 * 내용·반응은 이 셀 멤버 범위에서만 서버가 내려줌(프라이버시).
 */

const MODE = 'qt';
const REACTIONS = ['like', 'amen', 'pray'] as const;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

type NoteRow = { profile_id: string; reference: string | null; feelings: string | null; decision: string | null; prayer: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const cellId = typeof req.query.id === 'string' ? req.query.id : '';
  const profileId = requireSession(req, res);
  if (!profileId) return;
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (!cellId) return res.status(400).json({ error: 'cell id required' });
  if (!DATE_RX.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD' });

  try {
    const cell = await getCellById(cellId);
    if (!cell) return res.status(404).json({ error: 'cell not found' });
    if (!(await isCellMember(cellId, profileId))) return res.status(403).json({ error: 'not a member' });

    const memberRows = await getCellMembers(cellId);
    const memberIds = memberRows.map((m) => m.profile_id);

    // displayName
    const allProfiles = await getProfiles().catch(() => [] as any[]);
    const nameMap = new Map<string, string>();
    for (const p of allProfiles as Array<any>) nameMap.set(p.profileId, p.realName || p.nickname || (p.profileId || '').split('-').pop() || p.profileId);

    // 완료(참여)
    const completedIds = new Set<string>();
    if (memberIds.length) {
      const { data } = await db.from('oncell_user_completions').select('profile_id').eq('type', MODE).eq('date', date).in('profile_id', memberIds);
      for (const r of (data || []) as Array<{ profile_id: string }>) completedIds.add(r.profile_id);
    }

    // 공유(내용 공개)
    const shareVis = new Map<string, string>(); // profileId → visibility
    if (memberIds.length) {
      const { data } = await db.from('oncell_cell_shares').select('profile_id, visibility').eq('cell_id', cellId).eq('mode', MODE).eq('date', date).in('profile_id', memberIds);
      for (const r of (data || []) as Array<{ profile_id: string; visibility: string }>) shareVis.set(r.profile_id, r.visibility || 'full');
    }
    const sharedIds = [...shareVis.keys()];

    // 공유자 노트 내용
    const noteMap = new Map<string, NoteRow>();
    if (sharedIds.length) {
      const { data } = await db.from('oncell_qt_notes').select('profile_id, reference, feelings, decision, prayer').eq('date', date).in('profile_id', sharedIds);
      for (const r of (data || []) as NoteRow[]) noteMap.set(r.profile_id, r);
    }

    // 반응 집계
    const reactAgg = new Map<string, Record<string, number>>(); // author → {like,amen,pray}
    const myReacts = new Map<string, Set<string>>();             // author → reactions I gave
    if (sharedIds.length) {
      const { data } = await db.from('oncell_share_reactions').select('author_profile_id, reactor_profile_id, reaction').eq('cell_id', cellId).eq('mode', MODE).eq('date', date).in('author_profile_id', sharedIds);
      for (const r of (data || []) as Array<{ author_profile_id: string; reactor_profile_id: string; reaction: string }>) {
        const a = reactAgg.get(r.author_profile_id) || { like: 0, amen: 0, pray: 0 };
        if (r.reaction in a) a[r.reaction] += 1;
        reactAgg.set(r.author_profile_id, a);
        if (r.reactor_profile_id === profileId) {
          const s = myReacts.get(r.author_profile_id) || new Set<string>();
          s.add(r.reaction);
          myReacts.set(r.author_profile_id, s);
        }
      }
    }

    const contentFor = (pid: string) => {
      const vis = shareVis.get(pid);
      if (!vis) return null;
      const n = noteMap.get(pid);
      if (!n) return { reference: null, feelings: '', decision: '', prayer: '' };
      if (vis === 'feelings') return { reference: n.reference, feelings: n.feelings || '', decision: '', prayer: '' };
      return { reference: n.reference, feelings: n.feelings || '', decision: n.decision || '', prayer: n.prayer || '' };
    };

    const members = memberRows.map((m) => ({
      profileId: m.profile_id,
      displayName: nameMap.get(m.profile_id) || m.profile_id,
      isOwner: cell.owner_profile_id === m.profile_id,
      completed: completedIds.has(m.profile_id),
      shared: shareVis.has(m.profile_id),
      visibility: shareVis.get(m.profile_id) || null,
      content: contentFor(m.profile_id),
      reactions: reactAgg.get(m.profile_id) || { like: 0, amen: 0, pray: 0 },
      myReactions: [...(myReacts.get(m.profile_id) || [])],
    }));

    // 나
    let hasNote = false;
    {
      const { data } = await db.from('oncell_qt_notes').select('profile_id').eq('profile_id', profileId).eq('date', date).maybeSingle();
      hasNote = !!data;
    }

    return res.status(200).json({
      date,
      members,
      me: {
        hasNote,
        completed: completedIds.has(profileId),
        shared: shareVis.has(profileId),
        visibility: shareVis.get(profileId) || null,
      },
      counts: { completed: completedIds.size, total: memberIds.length },
    });
  } catch (e: any) {
    console.error('[api/cells/:id/today] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
