import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import {
  getSignupApprovals, setSignupApprovals,
  getProfiles, setProfiles,
  getUsers, setUsers,
  getEvents, setEvents,
} from '../../../lib/dataStore';
import { db } from '../../../lib/db';

/**
 * 시스템 관리자용 "가입 정보 삭제" — 특정 profileId 의 모든 개인정보 + 예약 완전 파기.
 *
 * 본인 자기-삭제는 차단 (관리자 UI 에서 disabled 로 이미 처리).
 *
 * DELETE /api/admin/delete-user?profileId=...
 */

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed.' });

  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : (req.body as any)?.profileId;
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });
  if (profileId === ok) return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });

  try {
    const [approvals, profiles, users, events] = await Promise.all([
      getSignupApprovals() as Promise<Array<{ profileId: string }>>,
      getProfiles() as Promise<Array<{ profileId: string }>>,
      getUsers() as Promise<Array<{ providerProfileId: string }>>,
      getEvents() as Promise<Array<{ type?: string; createdBy?: string }>>,
    ]);

    const nextApprovals = approvals.filter((a) => a.profileId !== profileId);
    const nextProfiles = profiles.filter((p) => p.profileId !== profileId);
    const nextUsers = users.filter((u) => u.providerProfileId !== profileId);
    const nextEvents = events.filter((e) => !(e.type === 'reservation' && e.createdBy === profileId));

    await Promise.all([
      setSignupApprovals(nextApprovals),
      setProfiles(nextProfiles),
      setUsers(nextUsers),
      setEvents(nextEvents),
    ]);

    // 묵상 기록·완료 이력 삭제 (본인 탈퇴 경로와 동일 정책)
    let qtNotesDeleted = 0;
    let completionsDeleted = 0;
    try {
      const { count: c1, error: e1 } = await db
        .from('kcis_qt_notes')
        .delete({ count: 'exact' })
        .eq('profile_id', profileId);
      if (e1) console.error('[admin/delete-user] kcis_qt_notes delete failed', e1);
      qtNotesDeleted = c1 || 0;
    } catch (e) {
      console.error('[admin/delete-user] kcis_qt_notes exception', e);
    }
    try {
      const { count: c2, error: e2 } = await db
        .from('kcis_user_completions')
        .delete({ count: 'exact' })
        .eq('profile_id', profileId);
      if (e2) console.error('[admin/delete-user] kcis_user_completions delete failed', e2);
      completionsDeleted = c2 || 0;
    } catch (e) {
      console.error('[admin/delete-user] kcis_user_completions exception', e);
    }

    return res.status(200).json({
      ok: true,
      deleted: {
        approvals: approvals.length - nextApprovals.length,
        profiles: profiles.length - nextProfiles.length,
        users: users.length - nextUsers.length,
        reservations: events.length - nextEvents.length,
        qtNotes: qtNotesDeleted,
        completions: completionsDeleted,
      },
    });
  } catch (e: any) {
    console.error('[admin/delete-user]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
