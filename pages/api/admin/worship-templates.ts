import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getWorshipTemplates, setWorshipTemplates } from '../../../lib/dataStore';

type Item = {
  id: string;
  title: string;
  description?: string;
  presenter?: string;
  allTogether?: boolean;
  link?: string;
  passage?: string;
  members?: string;
  prayerNote?: string;
  songs?: { title: string; link: string }[];
};
type Background = { type: 'default'; value: 'default1' | 'default2' | 'default3' } | { type: 'upload'; dataUrl: string } | null;
type Logo = { dataUrl: string } | null;
type File = {
  background: Background;
  logo: Logo;
  bulletinName: string;
  theme: string;
  worshipLabel: string;
  worshipDate: string;
  worshipTime: string;
  worshipLocation: string;
  churchName: string;
  items: Item[];
  announcementTitle: string;
  announcements: { title: string; content: string }[];
  homepage: string;
  footer: string;
};

const load = async (): Promise<File> => {
  const empty: File = { background: { type: 'default', value: 'default1' }, logo: null, bulletinName: '', theme: '', worshipLabel: 'WORSHIP', worshipDate: '', worshipTime: '오전 11:00', worshipLocation: '2층 사랑홀', churchName: '은혜교회 청년부', items: [], announcementTitle: '광고', announcements: [{ title: '광고', content: '' }], homepage: '', footer: '' };
  try {
    const parsed = ((await getWorshipTemplates()) || {}) as Partial<File> & { announcement?: string; announcements?: any };
    let announcements: { title: string; content: string }[];
    if (Array.isArray(parsed.announcements)) {
      announcements = parsed.announcements.map((a: any) =>
        typeof a === 'string' ? { title: '', content: a } : { title: String(a?.title ?? ''), content: String(a?.content ?? ''), ...(a?.noTitle ? { noTitle: true } : {}) },
      );
      if (announcements.length === 0) announcements = [{ title: '광고', content: '' }];
    } else if (typeof parsed.announcement === 'string' && parsed.announcement.length > 0) {
      announcements = [{ title: '', content: parsed.announcement }];
    } else {
      announcements = [{ title: '광고', content: '' }];
    }
    return {
      background: parsed.background ?? empty.background,
      logo: parsed.logo ?? null,
      bulletinName: parsed.bulletinName ?? '',
      theme: parsed.theme ?? '',
      worshipLabel: parsed.worshipLabel ?? empty.worshipLabel,
      worshipDate: parsed.worshipDate ?? '',
      worshipTime: parsed.worshipTime ?? empty.worshipTime,
      worshipLocation: parsed.worshipLocation ?? empty.worshipLocation,
      churchName: parsed.churchName ?? empty.churchName,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      announcementTitle: parsed.announcementTitle ?? empty.announcementTitle,
      announcements,
      homepage: parsed.homepage ?? '',
      footer: parsed.footer ?? '',
    };
  } catch {
    return empty;
  }
};

const save = async (file: File) => setWorshipTemplates(file);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  const file = await load();

  if (req.method === 'GET') {
    return res.status(200).json(file);
  }

  if (req.method === 'PUT') {
    const body = req.body as Partial<File>;
    if (body.background !== undefined) file.background = body.background;
    if (body.logo !== undefined) file.logo = body.logo;
    if (typeof body.bulletinName === 'string') file.bulletinName = body.bulletinName;
    if (typeof body.theme === 'string') file.theme = body.theme;
    if (typeof body.worshipLabel === 'string') file.worshipLabel = body.worshipLabel;
    if (typeof body.worshipDate === 'string') file.worshipDate = body.worshipDate;
    if (typeof body.worshipTime === 'string') file.worshipTime = body.worshipTime;
    if (typeof body.worshipLocation === 'string') file.worshipLocation = body.worshipLocation;
    if (typeof body.churchName === 'string') file.churchName = body.churchName;
    if (typeof body.announcementTitle === 'string') file.announcementTitle = body.announcementTitle;
    if (Array.isArray(body.announcements)) file.announcements = body.announcements;
    if (typeof body.homepage === 'string') file.homepage = body.homepage;
    if (typeof body.footer === 'string') file.footer = body.footer;
    await save(file);
    return res.status(200).json(file);
  }

  if (req.method === 'POST') {
    const body = req.body as Partial<Item>;
    if (!body.title || !body.title.trim()) return res.status(400).json({ error: 'title이 필요합니다.' });
    const item: Item = {
      id: `wt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: body.title.trim(),
      description: body.description?.trim() || '',
      presenter: body.presenter?.trim() || '',
      link: body.link?.trim() || '',
      passage: body.passage?.trim() || '',
      members: body.members?.trim() || '',
      prayerNote: body.prayerNote?.trim() || '',
      allTogether: Boolean(body.allTogether),
    };
    file.items.push(item);
    await save(file);
    return res.status(200).json({ item, file });
  }

  if (req.method === 'PATCH') {
    const body = req.body as Partial<Item> & { order?: number };
    const id = body.id;
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const idx = file.items.findIndex((it) => it.id === id);
    if (idx === -1) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    (['title', 'description', 'presenter', 'link', 'passage', 'members', 'prayerNote'] as const).forEach((k) => {
      if (typeof body[k] === 'string') (file.items[idx] as any)[k] = (body[k] as string).trim();
    });
    if (typeof body.allTogether === 'boolean') file.items[idx].allTogether = body.allTogether;
    if (Array.isArray((body as any).songs)) {
      file.items[idx].songs = (body as any).songs.map((s: any) => ({ title: String(s?.title ?? ''), link: String(s?.link ?? '') }));
    }
    if (typeof body.order === 'number' && body.order >= 0 && body.order < file.items.length) {
      const [moved] = file.items.splice(idx, 1);
      file.items.splice(body.order, 0, moved);
    }
    await save(file);
    return res.status(200).json(file);
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : (req.body as any)?.id;
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    file.items = file.items.filter((it) => it.id !== id);
    await save(file);
    return res.status(200).json(file);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
