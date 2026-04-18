import { getCommunityBulletinTemplates, setCommunityBulletinTemplates, getWorshipTemplates } from './dataStore';

type Map = Record<string, any>;

export const readCommunityTemplates = async (): Promise<Map> => {
  try {
    const parsed = await getCommunityBulletinTemplates();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const writeCommunityTemplates = async (map: Map) => {
  await setCommunityBulletinTemplates(map);
};

export const readSystemTemplate = async (): Promise<any | null> => {
  try {
    const parsed = await getWorshipTemplates();
    return parsed ?? null;
  } catch {
    return null;
  }
};

const DESIGN_KEYS = ['background', 'logo', 'churchName', 'worshipLabel', 'homepage', 'footer'];
const CONTENT_KEYS = ['bulletinName', 'theme', 'worshipDate', 'worshipTime', 'worshipLocation', 'items', 'announcementTitle', 'announcements'];

const toNestedBulletin = (raw: any): any => {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.design || raw.content) return { design: raw.design || {}, content: raw.content || {} };
  const design: any = {};
  const content: any = {};
  for (const k of DESIGN_KEYS) if (raw[k] !== undefined) design[k] = raw[k];
  for (const k of CONTENT_KEYS) if (raw[k] !== undefined) content[k] = raw[k];
  return { design, content };
};

export const seedCommunityTemplate = async (communityId: string, communityName?: string) => {
  const map = await readCommunityTemplates();
  if (map[communityId]) return map[communityId];
  const system = await readSystemTemplate();
  if (!system) return null;
  const nested = toNestedBulletin(JSON.parse(JSON.stringify(system)));
  if (communityName && communityName.trim()) {
    nested.design = nested.design || {};
    nested.design.churchName = communityName.trim();
  }
  map[communityId] = nested;
  await writeCommunityTemplates(map);
  return map[communityId];
};

export const getCommunityTemplate = async (communityId: string): Promise<any | null> => {
  const map = await readCommunityTemplates();
  return map[communityId] || null;
};
