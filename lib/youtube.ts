const API_KEY = process.env.YOUTUBE_API_KEY || '';
const BASE = 'https://www.googleapis.com/youtube/v3';

export type YTVideo = { videoId: string; title: string; publishedAt: string };

const channelIdCache = new Map<string, { id: string; at: number }>();
const uploadsCache = new Map<string, { id: string; at: number }>();
const itemsCache = new Map<string, { items: YTVideo[]; at: number }>();

const DAY = 24 * 60 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;

const decodeHtmlEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export const resolveChannelIdByHandle = async (handle: string): Promise<string | null> => {
  if (!API_KEY) {
    console.error('[youtube] YOUTUBE_API_KEY not set');
    return null;
  }
  const h = handle.replace(/^@/, '');
  const cached = channelIdCache.get(h);
  if (cached && Date.now() - cached.at < DAY) return cached.id;
  try {
    const url = `${BASE}/channels?part=id&forHandle=@${encodeURIComponent(h)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[youtube] resolveChannelIdByHandle http', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json();
    const id = json?.items?.[0]?.id || null;
    if (id) channelIdCache.set(h, { id, at: Date.now() });
    return id;
  } catch (e) {
    console.error('[youtube] resolveChannelIdByHandle error', e);
    return null;
  }
};

export const getUploadsPlaylistId = async (channelId: string): Promise<string | null> => {
  if (!API_KEY) return null;
  const cached = uploadsCache.get(channelId);
  if (cached && Date.now() - cached.at < DAY) return cached.id;
  try {
    const url = `${BASE}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[youtube] getUploadsPlaylistId http', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json();
    const id = json?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
    if (id) uploadsCache.set(channelId, { id, at: Date.now() });
    return id;
  } catch (e) {
    console.error('[youtube] getUploadsPlaylistId error', e);
    return null;
  }
};

export const fetchPlaylistItems = async (playlistId: string, maxResults = 50): Promise<YTVideo[]> => {
  if (!API_KEY) return [];
  const key = `${playlistId}:${maxResults}`;
  const cached = itemsCache.get(key);
  if (cached && Date.now() - cached.at < HALF_HOUR) return cached.items;
  try {
    const url = `${BASE}/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=${maxResults}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[youtube] fetchPlaylistItems http', res.status, await res.text().catch(() => ''));
      return [];
    }
    const json = await res.json();
    const items: YTVideo[] = ((json?.items as Array<any>) || [])
      .map((it) => ({
        videoId: it?.snippet?.resourceId?.videoId || '',
        title: decodeHtmlEntities(it?.snippet?.title || ''),
        publishedAt: it?.snippet?.publishedAt || '',
      }))
      .filter((v) => v.videoId && v.title && v.publishedAt);
    itemsCache.set(key, { items, at: Date.now() });
    return items;
  } catch (e) {
    console.error('[youtube] fetchPlaylistItems error', e);
    return [];
  }
};

export const fetchChannelUploadsByHandle = async (handle: string, maxResults = 50): Promise<YTVideo[]> => {
  const channelId = await resolveChannelIdByHandle(handle);
  if (!channelId) return [];
  const uploadsId = await getUploadsPlaylistId(channelId);
  if (!uploadsId) return [];
  return fetchPlaylistItems(uploadsId, maxResults);
};
