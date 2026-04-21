import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSidePropsContext } from 'next';
import { getSystemAdmins } from './dataStore';
import { kvGet, kvSet } from './db';

type AdminsFile = { profileIds: string[]; emails: string[] };

const loadAdmins = async (): Promise<AdminsFile> => {
  try {
    const parsed = (await getSystemAdmins()) as any;
    return {
      profileIds: Array.isArray(parsed?.profileIds) ? parsed.profileIds : [],
      emails: Array.isArray(parsed?.emails) ? (parsed.emails as string[]).map((e) => String(e).trim().toLowerCase()) : [],
    };
  } catch {
    return { profileIds: [], emails: [] };
  }
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
  if (profileId && admins.profileIds.includes(profileId)) return true;
  if (email && admins.emails.includes(email.trim().toLowerCase())) return true;
  return false;
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
