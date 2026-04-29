import type { NextApiRequest, NextApiResponse } from 'next';
import { buildIcs, IcsEvent } from '../../../../lib/ics';
import { EventRow as RawEventRow, ruleToRRule } from '../../../../lib/recurrence';
import { getCommunities, getEvents } from '../../../../lib/dataStore';

type Community = { id: string; name: string };

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).send('Missing community id');

  try {
    const [communities, allEvents] = await Promise.all([
      getCommunities() as Promise<Community[]>,
      (getEvents().catch(() => []) as Promise<RawEventRow[]>),
    ]);
    const community = communities.find((c) => c.id === id);
    if (!community) return res.status(404).send('Community not found');

    const rows = allEvents.filter((e) => e.communityId === id && ((e.type || 'event') === 'event'));
    const events: IcsEvent[] = rows.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      location: e.location,
      description: e.description,
      createdAt: e.createdAt,
      rrule: e.rule ? ruleToRRule(e.rule) : undefined,
    }));

    const host = (req.headers.host || 'oncell.app').toString();
    const ics = buildIcs({
      calendarName: `${community.name} · ONCELL`,
      events,
      host,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${id}.ics"`);
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5분
    return res.status(200).send(ics);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Failed to build calendar');
  }
};

export default handler;
