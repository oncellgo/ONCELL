import { kvGet, kvSet } from './db';

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const BASE = 'https://www.googleapis.com/youtube/v3';

export type YTVideo = { videoId: string; title: string; publishedAt: string };
/**
 * API 호출 결과의 상태 구분. UI 에서 에러 배너 노출에 사용.
 * - `ok`: 정상 응답(캐시 포함)
 * - `quota`: 일일 쿼터 초과 (HTTP 403 + reason=quotaExceeded|dailyLimitExceeded)
 * - `unauthorized`: API 키 미설정 / 401 / 403 그 외
 * - `network`: fetch 실패 (네트워크·DNS·타임아웃)
 * - `empty`: 응답은 성공했으나 items 가 비어있음 (희귀)
 */
export type YTFetchStatus = 'ok' | 'quota' | 'unauthorized' | 'network' | 'empty';

export type YTResult = { items: YTVideo[]; status: YTFetchStatus };

// ---------- Cache layer ----------
// 인스턴스 로컬(빠름) + Supabase KV 영속(람다 간 공유).
// items: 2시간 TTL. channelId/uploadsId: 7일 TTL (거의 불변).
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ITEMS_TTL = 2 * HOUR;
const IDS_TTL = 7 * DAY;
const KV_KEY = 'youtube_cache';

type PersistShape = {
  channels?: Record<string, { id: string; at: number }>;
  uploads?: Record<string, { id: string; at: number }>;
  items?: Record<string, { items: YTVideo[]; at: number }>;
};

const memChannels = new Map<string, { id: string; at: number }>();
const memUploads = new Map<string, { id: string; at: number }>();
const memItems = new Map<string, { items: YTVideo[]; at: number }>();

let persistLoaded = false;
let persistCache: PersistShape = {};

const loadPersist = async (): Promise<void> => {
  if (persistLoaded) return;
  try {
    const raw = (await kvGet<PersistShape>(KV_KEY)) || {};
    persistCache = {
      channels: raw.channels || {},
      uploads: raw.uploads || {},
      items: raw.items || {},
    };
    // Hydrate mem caches
    for (const [k, v] of Object.entries(persistCache.channels || {})) memChannels.set(k, v);
    for (const [k, v] of Object.entries(persistCache.uploads || {})) memUploads.set(k, v);
    for (const [k, v] of Object.entries(persistCache.items || {})) memItems.set(k, v);
    persistLoaded = true;
  } catch (e) {
    console.error('[youtube] persistent cache load failed (continuing with mem only)', e);
    persistLoaded = true; // 한 번만 시도
  }
};

const flushPersist = async (): Promise<void> => {
  try {
    const next: PersistShape = {
      channels: Object.fromEntries(memChannels),
      uploads: Object.fromEntries(memUploads),
      items: Object.fromEntries(memItems),
    };
    persistCache = next;
    await kvSet(KV_KEY, next);
  } catch (e) {
    console.error('[youtube] persistent cache write failed', e);
    // mem 캐시는 여전히 유효 — 실패 무시
  }
};

const decodeHtmlEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// YouTube HTTP error → 상태 태그 매핑
const classifyHttp = (status: number, body: string): Exclude<YTFetchStatus, 'ok' | 'empty'> => {
  if (status === 401) return 'unauthorized';
  if (status === 403) {
    if (/quota|dailyLimitExceeded|rateLimit/i.test(body)) return 'quota';
    return 'unauthorized';
  }
  return 'network';
};

export const resolveChannelIdByHandle = async (handle: string): Promise<{ id: string | null; status: YTFetchStatus }> => {
  if (!API_KEY) {
    console.error('[youtube] YOUTUBE_API_KEY not set');
    return { id: null, status: 'unauthorized' };
  }
  await loadPersist();
  const h = handle.replace(/^@/, '');
  const cached = memChannels.get(h);
  if (cached && Date.now() - cached.at < IDS_TTL) return { id: cached.id, status: 'ok' };
  try {
    const url = `${BASE}/channels?part=id&forHandle=@${encodeURIComponent(h)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const status = classifyHttp(res.status, body);
      console.error('[youtube] resolveChannelIdByHandle http', res.status, status, body.slice(0, 200));
      // stale cache 가 있으면 그거라도 반환 (expired 여도)
      if (cached) return { id: cached.id, status };
      return { id: null, status };
    }
    const json = await res.json();
    const id = json?.items?.[0]?.id || null;
    if (id) {
      memChannels.set(h, { id, at: Date.now() });
      void flushPersist();
      return { id, status: 'ok' };
    }
    return { id: null, status: 'empty' };
  } catch (e) {
    console.error('[youtube] resolveChannelIdByHandle network', e);
    if (cached) return { id: cached.id, status: 'network' };
    return { id: null, status: 'network' };
  }
};

export const getUploadsPlaylistId = async (channelId: string): Promise<{ id: string | null; status: YTFetchStatus }> => {
  if (!API_KEY) return { id: null, status: 'unauthorized' };
  await loadPersist();
  const cached = memUploads.get(channelId);
  if (cached && Date.now() - cached.at < IDS_TTL) return { id: cached.id, status: 'ok' };
  try {
    const url = `${BASE}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const status = classifyHttp(res.status, body);
      console.error('[youtube] getUploadsPlaylistId http', res.status, status, body.slice(0, 200));
      if (cached) return { id: cached.id, status };
      return { id: null, status };
    }
    const json = await res.json();
    const id = json?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
    if (id) {
      memUploads.set(channelId, { id, at: Date.now() });
      void flushPersist();
      return { id, status: 'ok' };
    }
    return { id: null, status: 'empty' };
  } catch (e) {
    console.error('[youtube] getUploadsPlaylistId network', e);
    if (cached) return { id: cached.id, status: 'network' };
    return { id: null, status: 'network' };
  }
};

export const fetchPlaylistItems = async (playlistId: string, maxResults = 50): Promise<YTResult> => {
  if (!API_KEY) return { items: [], status: 'unauthorized' };
  await loadPersist();
  const key = `${playlistId}:${maxResults}`;
  const cached = memItems.get(key);
  if (cached && Date.now() - cached.at < ITEMS_TTL) return { items: cached.items, status: 'ok' };
  try {
    const url = `${BASE}/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=${maxResults}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const status = classifyHttp(res.status, body);
      console.error('[youtube] fetchPlaylistItems http', res.status, status, body.slice(0, 200));
      if (cached) return { items: cached.items, status };
      return { items: [], status };
    }
    const json = await res.json();
    const items: YTVideo[] = ((json?.items as Array<any>) || [])
      .map((it) => ({
        videoId: it?.snippet?.resourceId?.videoId || '',
        title: decodeHtmlEntities(it?.snippet?.title || ''),
        publishedAt: it?.snippet?.publishedAt || '',
      }))
      .filter((v) => v.videoId && v.title && v.publishedAt);
    memItems.set(key, { items, at: Date.now() });
    void flushPersist();
    if (items.length === 0) return { items, status: 'empty' };
    return { items, status: 'ok' };
  } catch (e) {
    console.error('[youtube] fetchPlaylistItems network', e);
    if (cached) return { items: cached.items, status: 'network' };
    return { items: [], status: 'network' };
  }
};

// -------- RSS fallback (API key 없이/쿼터 초과 시) --------
// YouTube 는 각 채널의 업로드 playlist 에 대해 RSS feed 를 제공한다.
//   https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx
// API 가 unauthorized/quota/network 실패할 때 RSS 로 최근 업로드 ~15 개를 받아오는 fallback.
const channelIdFromHandleHtml = async (handle: string): Promise<string | null> => {
  try {
    const h = handle.replace(/^@/, '');
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(h)}`, {
      headers: { 'User-Agent': 'KCIS-app/1.0 (+https://kcis.app)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[\w-]+)"/);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

const parseYoutubeRss = (xml: string): YTVideo[] => {
  const items: YTVideo[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(xml))) {
    const entry = match[1];
    const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const pubMatch = entry.match(/<published>([^<]+)<\/published>/);
    if (!idMatch || !titleMatch || !pubMatch) continue;
    items.push({
      videoId: idMatch[1],
      title: decodeHtmlEntities(titleMatch[1]),
      publishedAt: pubMatch[1],
    });
  }
  return items;
};

const fetchChannelUploadsByRSS = async (handle: string): Promise<YTResult> => {
  await loadPersist();
  const h = handle.replace(/^@/, '');
  // 캐시된 channelId 있으면 재사용, 없으면 HTML scrape 시도.
  let channelId: string | null = memChannels.get(h)?.id || null;
  if (!channelId) {
    channelId = await channelIdFromHandleHtml(handle);
    if (channelId) {
      memChannels.set(h, { id: channelId, at: Date.now() });
      void flushPersist();
    }
  }
  if (!channelId) return { items: [], status: 'network' };
  try {
    const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { 'User-Agent': 'KCIS-app/1.0 (+https://kcis.app)' },
    });
    if (!rssRes.ok) return { items: [], status: 'network' };
    const xml = await rssRes.text();
    const items = parseYoutubeRss(xml);
    return { items, status: items.length === 0 ? 'empty' : 'ok' };
  } catch {
    return { items: [], status: 'network' };
  }
};

// Playlist 전용 RSS fallback — https://www.youtube.com/feeds/videos.xml?playlist_id=<ID>
const fetchPlaylistItemsByRSS = async (playlistId: string): Promise<YTResult> => {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`, {
      headers: { 'User-Agent': 'KCIS-app/1.0 (+https://kcis.app)' },
    });
    if (!res.ok) return { items: [], status: 'network' };
    const xml = await res.text();
    const items = parseYoutubeRss(xml);
    return { items, status: items.length === 0 ? 'empty' : 'ok' };
  } catch {
    return { items: [], status: 'network' };
  }
};

// Playlist API + RSS fallback 묶음. API 키 없음/쿼터/네트워크 실패 시 RSS 로 보완.
export const fetchPlaylistItemsWithFallback = async (playlistId: string, maxResults = 50): Promise<YTResult> => {
  const result = await fetchPlaylistItems(playlistId, maxResults);
  if (result.status === 'ok' || result.items.length > 0) return result;
  if (result.status === 'quota' || result.status === 'unauthorized' || result.status === 'network') {
    const rss = await fetchPlaylistItemsByRSS(playlistId);
    if (rss.items.length > 0) return { items: rss.items, status: 'ok' };
  }
  return result;
};

export const fetchChannelUploadsByHandle = async (handle: string, maxResults = 50): Promise<YTResult> => {
  const ch = await resolveChannelIdByHandle(handle);
  if (ch.id) {
    const up = await getUploadsPlaylistId(ch.id);
    if (up.id) {
      const result = await fetchPlaylistItems(up.id, maxResults);
      // API 로 items 획득 성공 or stale 캐시 사용 중이면 그대로 반환
      if (result.status === 'ok' || result.items.length > 0) return result;
      // API 쿼터/인증 실패 → RSS fallback
      if (result.status === 'quota' || result.status === 'unauthorized' || result.status === 'network') {
        const rss = await fetchChannelUploadsByRSS(handle);
        if (rss.items.length > 0) return { items: rss.items, status: 'ok' };
        return result;
      }
      return result;
    }
  }
  // API key 미설정 또는 handle 해석 실패 → 순수 RSS 경로
  const rss = await fetchChannelUploadsByRSS(handle);
  if (rss.items.length > 0) return { items: rss.items, status: 'ok' };
  return { items: [], status: ch.status === 'ok' ? 'network' : ch.status };
};
