import type { NextApiRequest, NextApiResponse } from 'next';

type Result = { id: string; title: string; channel: string; thumbnail: string };

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'q is required.' });

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=ko&persist_hl=1`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KCIS/1.0)',
        'Accept-Language': 'ko,en;q=0.8',
      },
    });
    if (!r.ok) return res.status(502).json({ error: 'YouTube fetch failed.' });
    const html = await r.text();

    // YouTube embeds initial data in `var ytInitialData = {...};`
    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    if (!match) return res.status(200).json({ results: [] });

    let data: any;
    try { data = JSON.parse(match[1]); } catch { return res.status(200).json({ results: [] }); }

    const results: Result[] = [];
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const it of items) {
        const v = it?.videoRenderer;
        if (!v?.videoId) continue;
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
        const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '';
        results.push({
          id: v.videoId,
          title,
          channel,
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        });
        if (results.length >= 8) break;
      }
      if (results.length >= 8) break;
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    return res.status(200).json({ results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Search failed.' });
  }
};

export default handler;
