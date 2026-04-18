import type { NextApiRequest, NextApiResponse } from 'next';
import { translate, translateBatch } from '../../../lib/aiTranslate';
import { getUsers } from '../../../lib/dataStore';

type User = {
  userId: string;
  providerProfileId: string;
  communityId: string;
  membershipStatus?: 'active' | 'pending';
};

const isMember = async (profileId: string, communityId: string): Promise<boolean> => {
  try {
    const users = (await getUsers()) as User[];
    return users.some((u) => u.providerProfileId === profileId && u.communityId === communityId && (u.membershipStatus || 'active') === 'active');
  } catch {
    return false;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { communityId, profileId, src, srcLang, tgtLang, contentType, items } = req.body as {
    communityId?: string;
    profileId?: string;
    src?: string;
    srcLang?: string;
    tgtLang?: string;
    contentType?: string;
    items?: Array<{ src: string; tgtLang: string }>;
  };

  if (!communityId) return res.status(400).json({ error: 'communityId is required.' });
  if (!profileId) return res.status(401).json({ error: 'profileId is required.' });
  if (!srcLang) return res.status(400).json({ error: 'srcLang is required.' });

  const member = await isMember(profileId, communityId);
  if (!member) return res.status(403).json({ error: 'Not a member of this community.' });

  try {
    if (Array.isArray(items) && items.length > 0) {
      const results = await translateBatch({ communityId, profileId, srcLang, contentType }, items);
      return res.status(200).json({ results });
    }
    if (!src || !tgtLang) return res.status(400).json({ error: 'src and tgtLang are required.' });
    const result = await translate({ communityId, profileId, src, srcLang, tgtLang, contentType });
    if (!result.ok && result.insufficient) {
      return res.status(402).json({ error: '번역 크레딧이 부족합니다.', ...result });
    }
    if (!result.ok) return res.status(500).json({ error: result.error || 'translation-failed' });
    return res.status(200).json(result);
  } catch (e: any) {
    console.error('translate handler error', e);
    return res.status(500).json({ error: e?.message || 'server-error' });
  }
};

export default handler;
