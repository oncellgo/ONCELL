import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getSignupApprovals, setSignupApprovals,
  getProfiles, setProfiles,
  getUsers, setUsers,
  getEvents, setEvents,
} from '../../../lib/dataStore';
import { kvGet, kvSet } from '../../../lib/db';

/**
 * 회원 탈퇴 — 본인 요청. admin 인증 없이 profileId 본인이 호출.
 *
 * 처리 정책 (사용자 안내 문구와 일치):
 *  1. 개인정보 즉시 파기 — profiles / users / signup_approvals 에서 해당 row 삭제
 *  2. 예약 내역 삭제 — events 중 type='reservation' 이면서 createdBy 가 본인인 row 삭제
 *  3. 법령 보존용 최소 로그 — withdrawn_logs KV 에 { profileId, reason, at } 만 저장
 *     (원인 파악·관리자 감사용. 실명/이메일/연락처 등 식별정보는 남기지 않음.)
 *
 * 차단(blocked) 상태는 탈퇴 처리 거부 — 관리자 이력 보존.
 */

type ApprovalRow = {
  profileId: string;
  status?: string;
};

type WithdrawnLog = { profileId: string; reason: string; at: string; provider?: string };

const LOG_KEY = 'withdrawn_logs_v1';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { profileId, reason } = req.body as { profileId?: string; reason?: string };
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });

  try {
    const [approvals, profiles, users, events] = await Promise.all([
      getSignupApprovals() as Promise<ApprovalRow[]>,
      getProfiles() as Promise<Array<{ profileId: string; provider?: string }>>,
      getUsers() as Promise<Array<{ providerProfileId: string }>>,
      getEvents() as Promise<Array<{ id: string; type?: string; createdBy?: string }>>,
    ]);

    const approval = approvals.find((a) => a.profileId === profileId);
    if (!approval) return res.status(404).json({ error: 'profile not found' });
    if (approval.status === 'blocked') return res.status(403).json({ error: 'blocked' });

    const provider = profiles.find((p) => p.profileId === profileId)?.provider;

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

    // 최소 탈퇴 로그 — 식별정보 없이 profileId 만 (법령·관리자 감사 목적)
    try {
      const logs = ((await kvGet<WithdrawnLog[]>(LOG_KEY)) || []) as WithdrawnLog[];
      logs.push({
        profileId,
        reason: (reason || '').trim().slice(0, 500),
        at: new Date().toISOString(),
        provider,
      });
      // 최근 1000건만 유지
      const trimmed = logs.slice(-1000);
      await kvSet(LOG_KEY, trimmed);
    } catch (e) {
      console.error('[withdraw] log write failed', e);
      // 로그 실패해도 탈퇴 자체는 성공으로 간주
    }

    return res.status(200).json({
      ok: true,
      deleted: {
        profiles: profiles.length - nextProfiles.length,
        users: users.length - nextUsers.length,
        approvals: approvals.length - nextApprovals.length,
        reservations: events.length - nextEvents.length,
      },
    });
  } catch (e: any) {
    console.error('[withdraw]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
