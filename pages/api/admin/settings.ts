import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getSettings, setSettings } from '../../../lib/dataStore';

type SignupField = 'realName' | 'contact';

type Settings = {
  venueSlotMin: number;
  signupApproval: 'auto' | 'admin';
  signupRequiredFields: SignupField[];
  venueAvailableStart: string;
  venueAvailableEnd: string;
  reservationLimitMode: 'unlimited' | 'perUser';
  reservationLimitPerUser: number; // 1..10 (valid when mode='perUser')
};

const sanitizeFields = (v: any): SignupField[] => {
  if (!Array.isArray(v)) return ['realName', 'contact'];
  const set = new Set<SignupField>();
  for (const item of v) {
    if (item === 'realName' || item === 'contact') set.add(item);
  }
  return Array.from(set);
};

const sanitizeHHMM = (v: any, fallback: string): string => {
  if (typeof v !== 'string') return fallback;
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
};

const sanitizePerUser = (v: any): number => {
  const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, n));
};

const readSettings = async (): Promise<Settings> => {
  try {
    const parsed = (await getSettings()) || {};
    return {
      venueSlotMin: typeof parsed.venueSlotMin === 'number' ? parsed.venueSlotMin : 30,
      signupApproval: parsed.signupApproval === 'admin' ? 'admin' : 'auto',
      signupRequiredFields: sanitizeFields(parsed.signupRequiredFields),
      venueAvailableStart: sanitizeHHMM(parsed.venueAvailableStart, '06:00'),
      venueAvailableEnd: sanitizeHHMM(parsed.venueAvailableEnd, '22:00'),
      reservationLimitMode: parsed.reservationLimitMode === 'perUser' ? 'perUser' : 'unlimited',
      reservationLimitPerUser: sanitizePerUser(parsed.reservationLimitPerUser),
    };
  } catch {
    return {
      venueSlotMin: 30,
      signupApproval: 'auto',
      signupRequiredFields: ['realName', 'contact'],
      venueAvailableStart: '06:00',
      venueAvailableEnd: '22:00',
      reservationLimitMode: 'unlimited',
      reservationLimitPerUser: 3,
    };
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    return res.status(200).json({ settings: await readSettings() });
  }

  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'PATCH') {
    const current = await readSettings();
    const { venueSlotMin, signupApproval, signupRequiredFields, venueAvailableStart, venueAvailableEnd, reservationLimitMode, reservationLimitPerUser } = req.body as Partial<Settings>;
    const next: Settings = {
      ...current,
      ...(typeof venueSlotMin === 'number' && (venueSlotMin === 30 || venueSlotMin === 60) ? { venueSlotMin } : {}),
      ...(signupApproval === 'auto' || signupApproval === 'admin' ? { signupApproval } : {}),
      ...(Array.isArray(signupRequiredFields) ? { signupRequiredFields: sanitizeFields(signupRequiredFields) } : {}),
      ...(typeof venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(venueAvailableStart) ? { venueAvailableStart } : {}),
      ...(typeof venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(venueAvailableEnd) ? { venueAvailableEnd } : {}),
      ...(reservationLimitMode === 'unlimited' || reservationLimitMode === 'perUser' ? { reservationLimitMode } : {}),
      ...(typeof reservationLimitPerUser !== 'undefined' ? { reservationLimitPerUser: sanitizePerUser(reservationLimitPerUser) } : {}),
    };
    await setSettings(next);
    return res.status(200).json({ settings: next });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
