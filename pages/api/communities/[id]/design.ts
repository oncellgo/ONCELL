import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunityTemplate, readCommunityTemplates, writeCommunityTemplates, seedCommunityTemplate } from '../../../../lib/communityTemplates';
import { getCommunities } from '../../../../lib/dataStore';

// NOTE: readCommunityTemplates / writeCommunityTemplates / seedCommunityTemplate
// still touch data/community-bulletin-templates.json via lib/communityTemplates.ts.
// dataStore exposes getCommunityBulletinTemplates / setCommunityBulletinTemplates
// which mirror that shape (Record<string, any>) — migrating lib/communityTemplates
// to use them is a separate refactor (out of scope for this batch).

const DESIGN_KEYS = ['background', 'logo', 'churchName', 'worshipLabel', 'homepage', 'footer'];

const normalize = (raw: any): any => {
  if (!raw || typeof raw !== 'object') return { design: {}, content: {} };
  if (raw.design || raw.content) return { design: raw.design || {}, content: raw.content || {} };
  const design: any = {};
  const content: any = {};
  for (const k of DESIGN_KEYS) if (raw[k] !== undefined) design[k] = raw[k];
  for (const k in raw) if (!DESIGN_KEYS.includes(k)) content[k] = raw[k];
  return { design, content };
};

type Community = { id: string; adminProfileId?: string; name?: string };

const isAdmin = async (profileId: string, communityId: string): Promise<boolean> => {
  try {
    const list = (await getCommunities()) as Community[];
    const c = list.find((x) => x.id === communityId);
    return !!c && c.adminProfileId === profileId;
  } catch { return false; }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const communityId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!communityId) return res.status(400).json({ error: 'communityId is required.' });

  try {
    if (req.method === 'GET') {
      let tpl = await getCommunityTemplate(communityId);
      if (!tpl) tpl = await seedCommunityTemplate(communityId);
      const n = normalize(tpl);
      return res.status(200).json({ design: n.design || {}, content: n.content || {} });
    }

    if (req.method === 'PATCH') {
      const { profileId, design } = req.body as { profileId?: string; design?: any };
      if (!profileId) return res.status(401).json({ error: 'profileId required.' });
      const admin = await isAdmin(profileId, communityId);
      if (!admin) return res.status(403).json({ error: 'Community admin only.' });
      if (!design || typeof design !== 'object') return res.status(400).json({ error: 'design required.' });

      const map = await readCommunityTemplates();
      const current = map[communityId] ? normalize(map[communityId]) : { design: {}, content: {} };
      const mergedDesign: any = { ...(current.design || {}) };
      for (const k of DESIGN_KEYS) {
        if (design[k] !== undefined) mergedDesign[k] = design[k];
      }
      map[communityId] = { design: mergedDesign, content: current.content || {} };
      await writeCommunityTemplates(map);
      return res.status(200).json({ design: mergedDesign });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e: any) {
    console.error('design handler error', e);
    return res.status(500).json({ error: e?.message || 'server-error' });
  }
};

export default handler;
