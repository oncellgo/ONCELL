import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunityTemplate, seedCommunityTemplate } from '../../../../lib/communityTemplates';
import { getWorshipServices, setWorshipServices, getWorshipTemplates } from '../../../../lib/dataStore';

type WorshipService = {
  id: string;
  communityId: string;
  name: string;
  startAt: string;
  createdAt: string;
  createdBy?: string;
  bulletin?: any;
  bulletinTemplateId?: string;
  recurrenceId?: string;
};

const MAX_RECURRENCE_COUNT = 52;

const DESIGN_KEYS = ['background', 'logo', 'churchName', 'worshipLabel', 'homepage', 'footer'];
const CONTENT_KEYS = ['bulletinName', 'theme', 'worshipDate', 'worshipTime', 'worshipLocation', 'items', 'announcementTitle', 'announcements'];

const normalizeBulletin = (raw: any): any => {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.design || raw.content) {
    // already nested — just ensure both present
    return { design: raw.design || {}, content: raw.content || {} };
  }
  const design: any = {};
  const content: any = {};
  for (const k of DESIGN_KEYS) if (raw[k] !== undefined) design[k] = raw[k];
  for (const k of CONTENT_KEYS) if (raw[k] !== undefined) content[k] = raw[k];
  return { design, content };
};

const readServices = async (): Promise<WorshipService[]> => {
  try {
    const arr = await getWorshipServices();
    return Array.isArray(arr) ? (arr as WorshipService[]) : [];
  } catch {
    return [];
  }
};

const readSystemTemplate = async () => {
  try {
    return (await getWorshipTemplates()) || null;
  } catch {
    return null;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const communityId = typeof req.query.id === 'string' ? req.query.id : null;
  if (!communityId) return res.status(400).json({ error: 'communityId is required.' });

  const ensureDefault = async () => {
    const all = await readServices();
    const hasDefault = all.some((s) => s.communityId === communityId && (s as any).isDefault);
    if (hasDefault) return all;
    const tpl = (await getCommunityTemplate(communityId)) || (await seedCommunityTemplate(communityId));
    const now = new Date();
    const dow = now.getDay();
    const daysUntil = dow === 0 ? 7 : (7 - dow);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil, 11, 0, 0, 0);
    all.push({
      id: `ws-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      communityId,
      name: '주일예배',
      startAt: next.toISOString(),
      createdAt: new Date().toISOString(),
      bulletin: tpl ? JSON.parse(JSON.stringify(tpl)) : null,
      isDefault: true,
    } as any);
    await setWorshipServices(all);
    return all;
  };

  try {
    if (req.method === 'GET') {
      const all = await ensureDefault();
      const services = all.filter((s) => s.communityId === communityId);
      services.sort((a, b) => b.startAt.localeCompare(a.startAt));
      // Resolve stub bulletins — carry-forward from most recent edited same-name past, then template
      const communityServices = all.filter((s) => s.communityId === communityId);
      const byId = new Map(communityServices.map((s) => [s.id, s] as const));
      const enriched = services.map((s) => {
        const nb = s.bulletin ? normalizeBulletin(s.bulletin) : null;
        let resolvedBulletin = nb;
        if (!nb) {
          // 1st priority: same-name past service with materialized bulletin
          const lastEdited = communityServices
            .filter((x) => x.name === s.name && x.bulletin && x.startAt < s.startAt)
            .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
          if (lastEdited?.bulletin) {
            resolvedBulletin = normalizeBulletin(lastEdited.bulletin);
          } else if (s.bulletinTemplateId) {
            // 2nd priority: explicit templateId reference
            const tpl = byId.get(s.bulletinTemplateId);
            if (tpl?.bulletin) resolvedBulletin = normalizeBulletin(tpl.bulletin);
          }
        }
        return { ...s, bulletin: nb, resolvedBulletin };
      });
      return res.status(200).json({ services: enriched });
    }

    if (req.method === 'POST') {
      const { name, startAt, generateBulletin, profileId, duplicateFromId, bulletinTemplateId, recurrenceId } = req.body as { name?: string; startAt?: string; generateBulletin?: boolean; profileId?: string; duplicateFromId?: string; bulletinTemplateId?: string; recurrenceId?: string };
      if (!name || !name.trim()) return res.status(400).json({ error: '템플릿 이름은 필수입니다.' });
      if (!duplicateFromId && !startAt) return res.status(400).json({ error: '예배 일시는 필수입니다.' });

      const services = await readServices();
      let bulletin: any = undefined;
      let refTemplateId: string | undefined;

      if (bulletinTemplateId) {
        // Stub mode: reference only, no snapshot. Materialize on edit.
        const source = services.find((s) => s.id === bulletinTemplateId && s.communityId === communityId);
        if (!source) return res.status(404).json({ error: '참조 템플릿을 찾을 수 없습니다.' });
        bulletin = null;
        refTemplateId = bulletinTemplateId;
      } else if (duplicateFromId) {
        const source = services.find((s) => s.id === duplicateFromId && s.communityId === communityId);
        if (!source) return res.status(404).json({ error: '복제 대상 템플릿을 찾을 수 없습니다.' });
        const sourceBulletin = source.bulletin || (source.bulletinTemplateId ? services.find((s) => s.id === source.bulletinTemplateId)?.bulletin : null);
        bulletin = sourceBulletin ? normalizeBulletin(JSON.parse(JSON.stringify(sourceBulletin))) : null;
      } else if (generateBulletin) {
        const startTs = new Date(startAt).getTime();
        const candidates = services
          .filter((s) => s.communityId === communityId && s.name.trim() === name.trim() && s.bulletin && new Date(s.startAt).getTime() < startTs)
          .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
        if (candidates.length > 0) {
          bulletin = normalizeBulletin(JSON.parse(JSON.stringify(candidates[0].bulletin)));
        } else {
          const communityTpl = await getCommunityTemplate(communityId);
          if (communityTpl) {
            bulletin = normalizeBulletin(JSON.parse(JSON.stringify(communityTpl)));
          } else {
            const tpl = await readSystemTemplate();
            bulletin = tpl ? normalizeBulletin(JSON.parse(JSON.stringify(tpl))) : null;
          }
        }
      }

      const row: WorshipService = {
        id: `ws-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        communityId,
        name: name.trim(),
        startAt: startAt || '',
        createdAt: new Date().toISOString(),
        createdBy: profileId,
        bulletin,
        ...(refTemplateId ? { bulletinTemplateId: refTemplateId } : {}),
        ...(recurrenceId ? { recurrenceId } : {}),
      };
      services.push(row);
      await setWorshipServices(services);
      return res.status(200).json({ service: row });
    }

    if (req.method === 'PATCH') {
      const { serviceId, bulletin, published, bulletinTemplateId, markEdited } = req.body as { serviceId?: string; bulletin?: any; published?: boolean; bulletinTemplateId?: string | null; markEdited?: boolean };
      if (!serviceId) return res.status(400).json({ error: 'serviceId required.' });
      const services = await readServices();
      const idx = services.findIndex((s) => s.id === serviceId && s.communityId === communityId);
      if (idx === -1) return res.status(404).json({ error: 'service not found.' });
      if (bulletin !== undefined) {
        services[idx].bulletin = bulletin === null ? null : normalizeBulletin(bulletin);
        // Once materialized, drop the template reference since it's now independent
        if (bulletin !== null && services[idx].bulletinTemplateId) delete services[idx].bulletinTemplateId;
      }
      if (bulletinTemplateId !== undefined) {
        if (bulletinTemplateId === null || bulletinTemplateId === '') {
          delete services[idx].bulletinTemplateId;
          services[idx].bulletin = null;
        } else {
          services[idx].bulletinTemplateId = bulletinTemplateId;
          services[idx].bulletin = null;
        }
      }
      if (typeof published === 'boolean') {
        (services[idx] as any).published = published;
        if (published) (services[idx] as any).publishedAt = new Date().toISOString();
      }
      if (markEdited) {
        (services[idx] as any).editedAt = new Date().toISOString();
      }
      await setWorshipServices(services);
      return res.status(200).json({ service: services[idx] });
    }

    if (req.method === 'DELETE') {
      const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : '';
      if (!serviceId) return res.status(400).json({ error: 'serviceId is required.' });
      const services = await readServices();
      const target = services.find((s) => s.id === serviceId && s.communityId === communityId);
      if (!target) return res.status(404).json({ error: 'service not found.' });
      if ((target as any).isDefault) return res.status(400).json({ error: '기본 템플릿은 삭제할 수 없습니다.' });
      const next = services.filter((s) => s.id !== serviceId || s.communityId !== communityId);
      await setWorshipServices(next);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Worship services handler failed.' });
  }
};

export default handler;
