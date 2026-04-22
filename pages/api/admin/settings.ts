import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getSettings, setSettings } from '../../../lib/dataStore';

type SignupField = 'realName' | 'contact';

type ContactPerson = { name: string; role: string; phone: string; email: string };

type Settings = {
  venueSlotMin: number;
  signupApproval: 'auto' | 'admin';
  signupRequiredFields: SignupField[];
  venueAvailableStart: string;
  venueAvailableEnd: string;
  reservationLimitMode: 'unlimited' | 'perUser';
  reservationLimitPerUser: number; // 1..10 (valid when mode='perUser')
  contactPersons: ContactPerson[]; // 담당자 연락처 (최대 2명)
  qtYoutubeHandle: string; // QT 새벽예배 영상을 가져올 유튜브 채널 핸들 (@ 제외)
  reservationBookingWindowMonths: 1 | 2 | 3 | 6; // 사용자가 예약할 수 있는 미래 범위 (개월)
};

const DEFAULT_QT_HANDLE = 'KoreanChurchInSingapore';

const sanitizeHandle = (v: any, fallback: string): string => {
  if (typeof v !== 'string') return fallback;
  const h = v.trim().replace(/^@/, '').slice(0, 60);
  return h || fallback;
};

const sanitizeBookingWindow = (v: any): 1 | 2 | 3 | 6 => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return (n === 2 || n === 3 || n === 6) ? (n as 2 | 3 | 6) : 1;
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

const sanitizeContactPersons = (v: any): ContactPerson[] => {
  if (!Array.isArray(v)) return [];
  const out: ContactPerson[] = [];
  for (const item of v.slice(0, 2)) {
    if (!item || typeof item !== 'object') continue;
    out.push({
      name: typeof item.name === 'string' ? item.name.trim().slice(0, 40) : '',
      role: typeof item.role === 'string' ? item.role.trim().slice(0, 40) : '',
      phone: typeof item.phone === 'string' ? item.phone.trim().slice(0, 40) : '',
      email: typeof item.email === 'string' ? item.email.trim().slice(0, 80) : '',
    });
  }
  return out;
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
      contactPersons: sanitizeContactPersons(parsed.contactPersons),
      qtYoutubeHandle: sanitizeHandle(parsed.qtYoutubeHandle, DEFAULT_QT_HANDLE),
      reservationBookingWindowMonths: sanitizeBookingWindow(parsed.reservationBookingWindowMonths),
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
      contactPersons: [],
      qtYoutubeHandle: DEFAULT_QT_HANDLE,
      reservationBookingWindowMonths: 1,
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
    const { venueSlotMin, signupApproval, signupRequiredFields, venueAvailableStart, venueAvailableEnd, reservationLimitMode, reservationLimitPerUser, contactPersons, qtYoutubeHandle, reservationBookingWindowMonths } = req.body as Partial<Settings>;
    const next: Settings = {
      ...current,
      ...(typeof venueSlotMin === 'number' && (venueSlotMin === 30 || venueSlotMin === 60) ? { venueSlotMin } : {}),
      ...(signupApproval === 'auto' || signupApproval === 'admin' ? { signupApproval } : {}),
      ...(Array.isArray(signupRequiredFields) ? { signupRequiredFields: sanitizeFields(signupRequiredFields) } : {}),
      ...(typeof venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(venueAvailableStart) ? { venueAvailableStart } : {}),
      ...(typeof venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(venueAvailableEnd) ? { venueAvailableEnd } : {}),
      ...(reservationLimitMode === 'unlimited' || reservationLimitMode === 'perUser' ? { reservationLimitMode } : {}),
      ...(typeof reservationLimitPerUser !== 'undefined' ? { reservationLimitPerUser: sanitizePerUser(reservationLimitPerUser) } : {}),
      ...(Array.isArray(contactPersons) ? { contactPersons: sanitizeContactPersons(contactPersons) } : {}),
      ...(typeof qtYoutubeHandle === 'string' ? { qtYoutubeHandle: sanitizeHandle(qtYoutubeHandle, current.qtYoutubeHandle) } : {}),
      ...(typeof reservationBookingWindowMonths !== 'undefined' ? { reservationBookingWindowMonths: sanitizeBookingWindow(reservationBookingWindowMonths) } : {}),
    };
    await setSettings(next);
    return res.status(200).json({ settings: next });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
