import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { getSystemAdmins, getCommunities, getUsers } from './dataStore';
import { kvGet, kvSet } from './db';

/**
 * 시스템 관리자 엔티티(가입자 단위).
 * - 한 사람 = 하나의 admin 레코드.
 * - profileIds 에 provider 별 id 를 **여러 개** 등록 (예: kakao-xxx, google-yyy).
 * - email 은 OAuth scope 동의 여부에 따라 빠질 수 있으므로 보조 키로만 사용.
 * - role 은 지금은 'system' 하나만. 추후 'finance' 등으로 확장 여지 보존.
 */
export type AdminEntity = {
  id: string;
  label: string;
  email: string;
  profileIds: string[];
  role: 'system';
  addedAt: string;
  addedBy?: string | null;
  notes?: string;
};

type AdminsFileEntity = { admins: AdminEntity[] };
// legacy flat 포맷 — 마이그레이션 전 구조. loader 가 자동 변환해서 읽음.
type AdminsFileLegacy = { profileIds: string[]; emails?: string[] };

const normalizeEmail = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');

const coerceToEntities = (raw: any): AdminEntity[] => {
  if (raw && Array.isArray(raw.admins)) {
    // 새 포맷
    return (raw.admins as any[])
      .filter((a) => a && typeof a === 'object')
      .map((a, i) => ({
        id: String(a.id || `admin-${i + 1}`),
        label: String(a.label || '').trim(),
        email: normalizeEmail(a.email),
        profileIds: Array.isArray(a.profileIds) ? a.profileIds.map((x: any) => String(x)).filter(Boolean) : [],
        role: 'system',
        addedAt: String(a.addedAt || ''),
        addedBy: a.addedBy ? String(a.addedBy) : null,
        notes: a.notes ? String(a.notes) : '',
      }));
  }
  // legacy: profileIds + emails flat. email 을 키로 최대한 병합, 남는 건 standalone 엔티티.
  const legacy = raw as AdminsFileLegacy | null | undefined;
  const profileIds: string[] = Array.isArray(legacy?.profileIds) ? legacy!.profileIds.map(String) : [];
  const emails: string[] = Array.isArray(legacy?.emails) ? legacy!.emails.map(normalizeEmail).filter(Boolean) : [];
  const out: AdminEntity[] = [];
  // 기존 flat 구조에는 profileId↔email 연관정보가 없어 **각각을 독립 엔티티**로 취급.
  // 마이그레이션 스크립트가 수동 병합할 수 있게 플레이스홀더 label 를 붙여둠.
  for (const pid of profileIds) {
    out.push({
      id: `admin-legacy-${pid}`,
      label: `(미지정) ${pid}`,
      email: '',
      profileIds: [pid],
      role: 'system',
      addedAt: '',
      addedBy: null,
      notes: 'legacy-profileId',
    });
  }
  for (const em of emails) {
    out.push({
      id: `admin-legacy-${em}`,
      label: `(미지정) ${em}`,
      email: em,
      profileIds: [],
      role: 'system',
      addedAt: '',
      addedBy: null,
      notes: 'legacy-email',
    });
  }
  return out;
};

type AdminsFile = AdminsFileEntity;

const loadAdmins = async (): Promise<AdminsFile> => {
  try {
    const parsed = await getSystemAdmins();
    return { admins: coerceToEntities(parsed) };
  } catch {
    return { admins: [] };
  }
};

export type AdminMatch = { admin: AdminEntity; matchedBy: 'profileId' | 'email' };

export const matchAdmin = (admins: AdminsFile, profileId: string | null, email: string | null): AdminMatch | null => {
  const emailNorm = normalizeEmail(email);
  for (const a of admins.admins) {
    if (profileId && a.profileIds.includes(profileId)) return { admin: a, matchedBy: 'profileId' };
  }
  for (const a of admins.admins) {
    if (emailNorm && a.email && a.email === emailNorm) return { admin: a, matchedBy: 'email' };
  }
  return null;
};

// 관리자 토큰은 우선 Supabase(app_kv:admin_access_token), 없으면 env로 폴백.
// UI에서 회전(rotate)하면 DB에 저장되며 env보다 우선됨.
export const getActiveAdminToken = async (): Promise<string | null> => {
  try {
    const fromDb = await kvGet<string>('admin_access_token');
    if (fromDb && typeof fromDb === 'string') return fromDb;
  } catch {}
  const fromEnv = process.env.ADMIN_ACCESS_TOKEN;
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
};

export const setActiveAdminToken = async (token: string): Promise<void> => {
  await kvSet('admin_access_token', token);
};

const pickString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export type SystemAdminCheck = { ok: true; profileId: string } | { ok: false };

const isAdminByEither = (admins: AdminsFile, profileId: string | null, email: string | null): boolean => {
  return matchAdmin(admins, profileId, email) !== null;
};

export const checkSystemAdmin = async (
  profileIdRaw: unknown,
  tokenRaw: unknown,
  emailRaw?: unknown,
): Promise<SystemAdminCheck> => {
  const profileId = pickString(profileIdRaw);
  const email = pickString(emailRaw);
  const token = pickString(tokenRaw);
  const expected = await getActiveAdminToken();

  if (!expected || !profileId || !token) return { ok: false };
  if (token !== expected) return { ok: false };

  const admins = await loadAdmins();
  if (!isAdminByEither(admins, profileId, email)) return { ok: false };
  return { ok: true, profileId };
};

export const requireSystemAdminSSR = async (ctx: GetServerSidePropsContext) => {
  const result = await checkSystemAdmin(ctx.query.profileId, ctx.query.k, ctx.query.email);
  if (!result.ok) return { notFound: true as const };
  return { ok: true as const, profileId: result.profileId };
};

export const getSystemAdminHref = async (
  profileId: string | null,
  extras?: { nickname?: string | null; email?: string | null },
): Promise<string | null> => {
  if (!profileId) return null;
  const token = await getActiveAdminToken();
  if (!token) return null;
  const admins = await loadAdmins();
  if (!isAdminByEither(admins, profileId, extras?.email || null)) return null;
  const qs = new URLSearchParams({ profileId, k: token });
  if (extras?.nickname) qs.set('nickname', extras.nickname);
  if (extras?.email) qs.set('email', extras.email);
  return `/admin/system?${qs.toString()}`;
};

/**
 * 관리자 접근이 필요한 일반 페이지용 서버 가드.
 *
 * - 비로그인 (`profileId` 없음) → `/` 로 리다이렉트
 * - 로그인되어 있으나 시스템 관리자도 아니고 어떤 공동체 관리자도 아님 → `/dashboard` 로 리다이렉트
 * - 시스템 관리자 OR 공동체 관리자 → 통과 + `{ profileId, isSystemAdmin, adminCommunityIds }` 반환
 *
 * 호출자의 `getServerSideProps` 에서 맨 앞에 호출하고, `'redirect' in guard` 일 때 `return guard` 로 종료.
 *
 * 주의: 관리자 판별은 `kcis_communities.adminProfileId` 와 `kcis_system_admins` 를 모두 확인.
 * email / nickname fallback 경로도 포함 (dashboard/management 기존 로직과 동일).
 */
export const requireAdminAccessSSR = async (
  ctx: GetServerSidePropsContext,
): Promise<
  | { redirect: { destination: string; permanent: false } }
  | { ok: true; profileId: string; email: string | null; nickname: string | null; isSystemAdmin: boolean; adminCommunityIds: string[] }
> => {
  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;

  if (!profileId) {
    return { redirect: { destination: '/', permanent: false } };
  }

  // 시스템 관리자 체크 (토큰 없이도 판별 — 토큰 기반은 /admin/system 전용)
  const admins = await loadAdmins();
  const isSystemAdmin = isAdminByEither(admins, profileId, email);

  // 공동체 관리자 체크 (user entries 를 통한 email/nickname fallback 포함)
  const communities = ((await getCommunities()) || []) as Array<{ id: string; adminProfileId?: string }>;
  const users = ((await getUsers()) || []) as Array<{ providerProfileId: string; nickname: string; communityId: string; profile?: { kakao_account?: { email?: string } } }>;
  const providerPrefix = profileId.includes('-') ? profileId.split('-')[0] : null;
  const matchedUsers = users.filter((u) => {
    if (u.providerProfileId === profileId) return true;
    if (providerPrefix && nickname && u.providerProfileId.startsWith(`${providerPrefix}-`) && u.nickname === nickname) return true;
    if (email && u.profile?.kakao_account?.email === email) return true;
    return false;
  });
  const joinedIds = new Set(matchedUsers.map((u) => u.communityId));
  const adminCommunityIds = communities
    .filter((c) => {
      if (!joinedIds.has(c.id)) return false;
      if (!c.adminProfileId) return false;
      if (c.adminProfileId === profileId) return true;
      if (providerPrefix && nickname && c.adminProfileId === `${providerPrefix}-${nickname}`) return true;
      if (email && c.adminProfileId === email) return true;
      return false;
    })
    .map((c) => c.id);

  if (!isSystemAdmin && adminCommunityIds.length === 0) {
    // 권한 없는 로그인 사용자 — 대시보드로 되돌림
    const qs = new URLSearchParams({ profileId });
    if (nickname) qs.set('nickname', nickname);
    if (email) qs.set('email', email);
    return { redirect: { destination: `/dashboard?${qs.toString()}`, permanent: false } };
  }

  return { ok: true, profileId, email, nickname, isSystemAdmin, adminCommunityIds };
};

export const requireSystemAdminApi = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<string | null> => {
  const profileId = req.headers['x-profile-id'] ?? (req.query.profileId as string | undefined) ?? (req.body?.profileId as string | undefined);
  const email = req.headers['x-email'] ?? (req.query.email as string | undefined) ?? (req.body?.email as string | undefined);
  const token = req.headers['x-admin-token'] ?? (req.query.k as string | undefined) ?? (req.body?.k as string | undefined);
  const result = await checkSystemAdmin(profileId, token, email);
  if (!result.ok) {
    res.status(404).end();
    return null;
  }
  return result.profileId;
};
