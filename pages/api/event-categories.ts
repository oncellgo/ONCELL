import type { NextApiRequest, NextApiResponse } from 'next';
import { getEventCategories, setEventCategories } from '../../lib/dataStore';

const DEFAULTS = ['일반예배', '특별예배', '기도회', '특별기도회', '행사', '기념일'];

const readCategories = async (): Promise<string[]> => {
  try {
    const list = await getEventCategories();
    if (Array.isArray(list) && list.length > 0) return list.map((x) => String(x)).filter(Boolean);
    return [...DEFAULTS];
  } catch {
    return [...DEFAULTS];
  }
};

const writeCategories = async (list: string[]) => {
  await setEventCategories(list);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === 'GET') {
      const list = await readCategories();
      return res.status(200).json({ categories: list });
    }
    if (req.method === 'POST') {
      const { name } = (req.body || {}) as { name?: string };
      const trimmed = String(name || '').trim();
      if (!trimmed) return res.status(400).json({ error: '구분명이 필요합니다.' });
      const list = await readCategories();
      if (list.includes(trimmed)) return res.status(409).json({ error: '이미 존재하는 구분입니다.' });
      list.push(trimmed);
      await writeCategories(list);
      return res.status(200).json({ categories: list });
    }
    if (req.method === 'DELETE') {
      const name = typeof req.query.name === 'string' ? req.query.name : '';
      if (!name) return res.status(400).json({ error: 'name이 필요합니다.' });
      const LOCKED = ['일반예배', '특별예배', '기도회', '특별기도회'];
      if (LOCKED.includes(name)) {
        return res.status(400).json({ error: '기본 구분은 삭제할 수 없습니다.' });
      }
      const list = (await readCategories()).filter((x) => x !== name);
      await writeCategories(list);
      return res.status(200).json({ categories: list });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('event-categories handler failed:', error);
    return res.status(500).json({ error: '구분을 처리하지 못했습니다.' });
  }
};

export default handler;
