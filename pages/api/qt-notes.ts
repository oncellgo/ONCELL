import type { NextApiRequest, NextApiResponse } from 'next';
import { getQtNotes, setQtNotes } from '../../lib/dataStore';
import { db } from '../../lib/db';
import { getSGTodayKey } from '../../lib/events';

type QtNote = {
  profileId: string;
  date: string;        // YYYY-MM-DD (사용자 로컬 기준)
  reference: string | null;
  feelings: string;    // 느낀점
  decision: string;    // 나의 결단
  prayer: string;      // 기도제목
  updatedAt: string;
};

const readNotes = async (): Promise<QtNote[]> => {
  try {
    const parsed = await getQtNotes();
    return Array.isArray(parsed) ? (parsed as QtNote[]) : [];
  } catch {
    return [];
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const notes = await readNotes();

    if (req.method === 'GET') {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      if (!profileId) return res.status(400).json({ error: 'profileId is required.' });
      if (date) {
        const note = notes.find((n) => n.profileId === profileId && n.date === date) || null;
        return res.status(200).json({ note });
      }
      const mine = notes
        .filter((n) => n.profileId === profileId)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return res.status(200).json({ notes: mine });
    }

    if (req.method === 'POST') {
      const { profileId, date, reference, feelings, decision, prayer } = (req.body || {}) as Partial<QtNote>;
      if (!profileId || !date) {
        return res.status(400).json({ error: 'profileId, date가 필요합니다.' });
      }
      // 도메인 규칙(service-plan §7): 큐티 완료는 SG 기준 오늘만 가능.
      // 과거 소급 / 미래 선지급 금지. 클라이언트 UI 우회 시도도 서버에서 차단.
      const todayKeySG = getSGTodayKey();
      if (date !== todayKeySG) {
        return res.status(400).json({ error: `큐티 묵상은 오늘(${todayKeySG}) 날짜에만 저장할 수 있습니다.` });
      }
      const next: QtNote = {
        profileId,
        date,
        reference: reference || null,
        feelings: typeof feelings === 'string' ? feelings : '',
        decision: typeof decision === 'string' ? decision : '',
        prayer: typeof prayer === 'string' ? prayer : '',
        updatedAt: new Date().toISOString(),
      };
      const idx = notes.findIndex((n) => n.profileId === profileId && n.date === date);
      if (idx >= 0) notes[idx] = next;
      else notes.push(next);
      await setQtNotes(notes);

      // 3항목 중 하나라도 작성됐으면 QT 완료 기록 (upsert), 모두 비면 삭제
      const hasAny = !!((next.feelings && next.feelings.trim()) || (next.decision && next.decision.trim()) || (next.prayer && next.prayer.trim()));
      try {
        if (hasAny) {
          await db.from('oncell_user_completions').upsert(
            { profile_id: profileId, type: 'qt', date, completed_at: new Date().toISOString() },
            { onConflict: 'profile_id,type,date' },
          );
        } else {
          await db.from('oncell_user_completions').delete().eq('profile_id', profileId).eq('type', 'qt').eq('date', date);
        }
      } catch (e) {
        console.error('[qt-notes] completion sync failed:', e);
      }

      return res.status(200).json({ note: next });
    }

    if (req.method === 'DELETE') {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      if (!profileId || !date) return res.status(400).json({ error: 'profileId와 date가 필요합니다.' });
      const filtered = notes.filter((n) => !(n.profileId === profileId && n.date === date));
      await setQtNotes(filtered);
      try {
        await db.from('oncell_user_completions').delete().eq('profile_id', profileId).eq('type', 'qt').eq('date', date);
      } catch {}
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('qt-notes handler failed:', error);
    return res.status(500).json({ error: '묵상노트를 처리하지 못했습니다.' });
  }
};

export default handler;
