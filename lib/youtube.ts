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

export const fetchChannelUploadsByHandle = async (handle: string, maxResults = 50): Promise<YTResult> => {
  const ch = await resolveChannelIdByHandle(handle);
  if (!ch.id) return { items: [], status: ch.status };
  const up = await getUploadsPlaylistId(ch.id);
  if (!up.id) return { items: [], status: up.status };
  return fetchPlaylistItems(up.id, maxResults);
};
