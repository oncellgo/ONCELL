import crypto from 'crypto';
import { chargeCredits } from './credits';
import { getTranslationsCache, setTranslationsCache } from './dataStore';

type CacheEntry = {
  src: string;
  srcLang: string;
  tgtLang: string;
  result: string;
  translator: string;   // which provider produced this
  at: string;           // ISO
};

type Cache = Record<string, CacheEntry>;

const readCache = async (): Promise<Cache> => {
  try {
    const parsed = await getTranslationsCache();
    return parsed && typeof parsed === 'object' ? (parsed as Cache) : {};
  } catch {
    return {};
  }
};

const writeCache = async (cache: Cache) => {
  await setTranslationsCache(cache);
};

const hashKey = (src: string, srcLang: string, tgtLang: string): string =>
  crypto.createHash('sha256').update(`${srcLang}:${tgtLang}:${src}`).digest('hex').slice(0, 32);

// ---- Mock translator -------------------------------------------------------
// Replace this with actual AI provider call (OpenAI / Anthropic / DeepL).
// Keep signature identical so swap-in is trivial.
const mockTranslate = async (src: string, srcLang: string, tgtLang: string): Promise<string> => {
  // For now, prefix with [LANG] so developers can see it worked.
  return `[${tgtLang.toUpperCase()}] ${src}`;
};
// ---------------------------------------------------------------------------

export type TranslateParams = {
  communityId: string;
  profileId?: string;
  src: string;
  srcLang: string;       // e.g. 'ko'
  tgtLang: string;       // e.g. 'en'
  contentType?: string;  // free-form tag: 'announcement', 'prayer', 'bulletin.theme' etc.
};

export type TranslateResult = {
  ok: boolean;
  result?: string;
  cacheHit: boolean;
  cost: number;          // chars charged (0 if cache hit)
  balanceAfter?: number;
  insufficient?: boolean;
  error?: string;
};

export const translate = async (params: TranslateParams): Promise<TranslateResult> => {
  const { communityId, profileId, src, srcLang, tgtLang, contentType } = params;
  if (!src || !srcLang || !tgtLang) return { ok: false, cacheHit: false, cost: 0, error: 'missing-params' };
  if (srcLang === tgtLang) return { ok: true, result: src, cacheHit: true, cost: 0 };

  const key = hashKey(src, srcLang, tgtLang);
  const cache = await readCache();
  if (cache[key]) {
    // Cache hit — free. Still log for analytics (cost 0).
    await chargeCredits({
      communityId,
      profileId,
      action: 'ai_translate',
      cost: 0,
      metadata: { srcLang, tgtLang, contentType, cacheHit: true, chars: src.length },
    });
    return { ok: true, result: cache[key].result, cacheHit: true, cost: 0 };
  }

  // Call provider (currently mock)
  let result: string;
  try {
    result = await mockTranslate(src, srcLang, tgtLang);
  } catch (e: any) {
    return { ok: false, cacheHit: false, cost: 0, error: e?.message || 'translation-failed' };
  }

  const cost = Math.max(src.length, result.length);

  const charge = await chargeCredits({
    communityId,
    profileId,
    action: 'ai_translate',
    cost,
    metadata: { srcLang, tgtLang, contentType, cacheHit: false, chars: src.length, resultChars: result.length },
  });

  if (!charge.ok) {
    return { ok: false, cacheHit: false, cost, balanceAfter: charge.balanceAfter, insufficient: charge.insufficient, error: 'insufficient-credits' };
  }

  // Persist cache after successful charge
  cache[key] = { src, srcLang, tgtLang, result, translator: 'mock', at: new Date().toISOString() };
  await writeCache(cache);

  return { ok: true, result, cacheHit: false, cost, balanceAfter: charge.balanceAfter };
};

export const translateBatch = async (
  base: Omit<TranslateParams, 'src' | 'tgtLang'>,
  items: Array<{ src: string; tgtLang: string }>,
): Promise<TranslateResult[]> => {
  const out: TranslateResult[] = [];
  for (const it of items) {
    const r = await translate({ ...base, src: it.src, tgtLang: it.tgtLang });
    out.push(r);
  }
  return out;
};
