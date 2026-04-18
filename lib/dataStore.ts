// ---------------------------------------------------------------
// Supabase-backed compatibility layer for the legacy data/*.json calls.
// 각 파일별 get/set 함수를 노출. 기존 코드의 readFile/writeFile 호출을
// 한 줄짜리 함수 호출로 대체할 수 있게 한다.
//
// 사용 예:
//   import { getEvents, setEvents } from '@/lib/dataStore';
//   const events = await getEvents();          // == readFile('data/events.json')
//   ... mutate ...
//   await setEvents(events);                   // == writeFile('data/events.json', ...)
// ---------------------------------------------------------------

import { db, T, kvGet, kvSet, KV_KEYS } from './db';

// snake ↔ camel
const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const objToSnake = (o: any) => {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) return o;
  const out: any = {};
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) continue;
    out[camelToSnake(k)] = o[k];
  }
  return out;
};
const objToCamel = (o: any) => {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) return o;
  const out: any = {};
  for (const k of Object.keys(o)) out[snakeToCamel(k)] = o[k];
  return out;
};

// ============================================================
// generic helpers
// ============================================================
const fetchAll = async (table: string): Promise<any[]> => {
  const { data, error } = await db.from(table).select('*');
  if (error) throw new Error(`[dataStore] ${table} read failed: ${error.message}`);
  return (data || []).map(objToCamel);
};

const replaceAll = async (table: string, rows: any[], pk: string | string[]): Promise<void> => {
  // 안전하게: 새 ids 집합을 구성, 기존 중 누락된 것은 삭제, 나머지는 upsert.
  const incoming = (rows || []).map(objToSnake);
  const onConflict = Array.isArray(pk) ? pk.join(',') : pk;
  if (incoming.length > 0) {
    const { error: upErr } = await db.from(table).upsert(incoming, { onConflict });
    if (upErr) throw new Error(`[dataStore] ${table} upsert failed: ${upErr.message}`);
  }
  // 삭제 대상: incoming에 없는 기존 PK
  const pkCols = Array.isArray(pk) ? pk : [pk];
  const { data: existing, error: selErr } = await db.from(table).select(pkCols.join(','));
  if (selErr) throw new Error(`[dataStore] ${table} select failed: ${selErr.message}`);
  const incomingKeys = new Set(incoming.map((r) => pkCols.map((c) => r[c]).join('|')));
  const toDelete = (existing || []).filter((r: any) => !incomingKeys.has(pkCols.map((c) => r[c]).join('|')));
  for (const r of toDelete) {
    let q = db.from(table).delete();
    for (const c of pkCols) q = q.eq(c, (r as any)[c]);
    const { error: delErr } = await q;
    if (delErr) throw new Error(`[dataStore] ${table} delete failed: ${delErr.message}`);
  }
};

// ============================================================
// communities (array, pk=id)
// ============================================================
export const getCommunities = async (): Promise<any[]> => fetchAll(T.communities);
export const setCommunities = async (rows: any[]): Promise<void> => replaceAll(T.communities, rows, 'id');

// ============================================================
// profiles (array, pk=profile_id / camel: profileId)
// ============================================================
export const getProfiles = async (): Promise<any[]> => fetchAll(T.profiles);
export const setProfiles = async (rows: any[]): Promise<void> => replaceAll(T.profiles, rows, 'profile_id');

// ============================================================
// users (array, pk=provider_profile_id / camel: providerProfileId)
// ============================================================
export const getUsers = async (): Promise<any[]> => fetchAll(T.users);
export const setUsers = async (rows: any[]): Promise<void> => replaceAll(T.users, rows, 'provider_profile_id');

// ============================================================
// events (array, pk=id)
// ============================================================
export const getEvents = async (): Promise<any[]> => fetchAll(T.events);
export const setEvents = async (rows: any[]): Promise<void> => replaceAll(T.events, rows, 'id');

// ============================================================
// worship services (array, pk=id)
// ============================================================
export const getWorshipServices = async (): Promise<any[]> => fetchAll(T.worshipServices);
export const setWorshipServices = async (rows: any[]): Promise<void> => replaceAll(T.worshipServices, rows, 'id');

// ============================================================
// venues (array, pk=id)
// ============================================================
export const getVenues = async (): Promise<any[]> => fetchAll(T.venues);
export const setVenues = async (rows: any[]): Promise<void> => replaceAll(T.venues, rows, 'id');

// ============================================================
// floors (array of strings)
// ============================================================
export const getFloors = async (): Promise<string[]> => {
  const { data, error } = await db.from(T.floors).select('name, ord').order('ord');
  if (error) throw new Error(`[dataStore] floors read failed: ${error.message}`);
  return (data || []).map((r: any) => r.name);
};
export const setFloors = async (names: string[]): Promise<void> => {
  const rows = (names || []).map((name, i) => ({ name, ord: i }));
  await replaceAll(T.floors, rows, 'name');
};

// ============================================================
// venue blocks (array, pk=id)
// ============================================================
export const getVenueBlocks = async (): Promise<any[]> => fetchAll(T.venueBlocks);
export const setVenueBlocks = async (rows: any[]): Promise<void> => replaceAll(T.venueBlocks, rows, 'id');

// ============================================================
// venue block groups (array, pk=id)
// ============================================================
export const getVenueBlockGroups = async (): Promise<any[]> => fetchAll(T.venueBlockGroups);
export const setVenueBlockGroups = async (rows: any[]): Promise<void> => replaceAll(T.venueBlockGroups, rows, 'id');

// ============================================================
// community bulletin templates (object: {communityId: {...}})
// ============================================================
export const getCommunityBulletinTemplates = async (): Promise<Record<string, any>> => {
  const { data, error } = await db.from(T.communityBulletinTemplates).select('community_id, data');
  if (error) throw new Error(`[dataStore] community_bulletin_templates read failed: ${error.message}`);
  const out: Record<string, any> = {};
  for (const r of data || []) out[(r as any).community_id] = (r as any).data;
  return out;
};
export const setCommunityBulletinTemplates = async (obj: Record<string, any>): Promise<void> => {
  const rows = Object.entries(obj || {}).map(([cid, d]) => ({
    community_id: cid,
    data: d,
    updated_at: new Date().toISOString(),
  }));
  await replaceAll(T.communityBulletinTemplates, rows, 'community_id');
};

// ============================================================
// signup approvals (array, pk=profile_id)
// ============================================================
export const getSignupApprovals = async (): Promise<any[]> => fetchAll(T.signupApprovals);
export const setSignupApprovals = async (rows: any[]): Promise<void> => replaceAll(T.signupApprovals, rows, 'profile_id');

// ============================================================
// qt notes (array, composite pk=profile_id+date)
// ============================================================
export const getQtNotes = async (): Promise<any[]> => fetchAll(T.qtNotes);
export const setQtNotes = async (rows: any[]): Promise<void> => replaceAll(T.qtNotes, rows, ['profile_id', 'date']);

// ============================================================
// event categories (array of strings)
// ============================================================
export const getEventCategories = async (): Promise<string[]> => {
  const { data, error } = await db.from(T.eventCategories).select('name, ord').order('ord');
  if (error) throw new Error(`[dataStore] event_categories read failed: ${error.message}`);
  return (data || []).map((r: any) => r.name);
};
export const setEventCategories = async (names: string[]): Promise<void> => {
  const rows = (names || []).map((name, i) => ({ name, ord: i }));
  await replaceAll(T.eventCategories, rows, 'name');
};

// ============================================================
// app singletons via app_kv
// ============================================================
export const getSettings = async (): Promise<any> => (await kvGet(KV_KEYS.settings)) || {};
export const setSettings = async (val: any): Promise<void> => kvSet(KV_KEYS.settings, val);

export const getSystemAdmins = async (): Promise<any> => (await kvGet(KV_KEYS.systemAdmins)) || { profileIds: [] };
export const setSystemAdmins = async (val: any): Promise<void> => kvSet(KV_KEYS.systemAdmins, val);

export const getWorshipTemplates = async (): Promise<any> => (await kvGet(KV_KEYS.worshipTemplates)) || null;
export const setWorshipTemplates = async (val: any): Promise<void> => kvSet(KV_KEYS.worshipTemplates, val);

export const getUsageLogs = async (): Promise<any[]> => (await kvGet<any[]>(KV_KEYS.usageLogs)) || [];
export const setUsageLogs = async (val: any[]): Promise<void> => kvSet(KV_KEYS.usageLogs, val);

export const getTranslationsCache = async (): Promise<Record<string, any>> =>
  (await kvGet<Record<string, any>>(KV_KEYS.translationsCache)) || {};
export const setTranslationsCache = async (val: Record<string, any>): Promise<void> =>
  kvSet(KV_KEYS.translationsCache, val);
