import { kvGet, kvSet } from './db';

/**
 * 외부 사이트 크롤 + PDF 파싱 API 용 2-layer 영속 캐시.
 *
 * - in-memory Map (warm lambda 간 고속 hit)
 * - Supabase KV (lambda 인스턴스 간 공유 — 콜드스타트에도 TTL 내 재사용)
 *
 * 사용 예:
 *   const cache = makeKvCache<MyData>('bulletin_cache_v1', 30 * 60 * 1000);
 *   const cached = await cache.get('default');
 *   if (cached) return cached;
 *   const data = await fetchExpensive();
 *   await cache.set('default', data);
 */

type Entry<T> = { value: T; at: number };

export class KvCache<T> {
  private mem = new Map<string, Entry<T>>();
  private loaded = false;
  private pendingFlush: ReturnType<typeof setTimeout> | null = null;

  constructor(private kvKey: string, private defaultTtl: number) {}

  async get(key: string, ttl: number = this.defaultTtl): Promise<T | null> {
    await this.hydrate();
    const hit = this.mem.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at >= ttl) return null;
    return hit.value;
  }

  async getStale(key: string): Promise<{ value: T; at: number } | null> {
    await this.hydrate();
    const hit = this.mem.get(key);
    return hit ? { value: hit.value, at: hit.at } : null;
  }

  async set(key: string, value: T): Promise<void> {
    await this.hydrate();
    this.mem.set(key, { value, at: Date.now() });
    this.scheduleFlush();
  }

  async delete(key: string): Promise<void> {
    await this.hydrate();
    this.mem.delete(key);
    this.scheduleFlush();
  }

  private async hydrate(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = (await kvGet<Record<string, Entry<T>>>(this.kvKey)) || {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && 'value' in v && 'at' in v) this.mem.set(k, v);
      }
    } catch (e) {
      console.error('[crawlCache] hydrate failed', this.kvKey, e);
    }
    this.loaded = true;
  }

  // 동일 람다 내 연속 set 이 많을 때 debounce — 마지막 set 후 200ms 에 한 번만 flush.
  private scheduleFlush(): void {
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.pendingFlush = setTimeout(() => {
      this.pendingFlush = null;
      void this.flush();
    }, 200);
  }

  private async flush(): Promise<void> {
    try {
      await kvSet(this.kvKey, Object.fromEntries(this.mem));
    } catch (e) {
      console.error('[crawlCache] flush failed', this.kvKey, e);
    }
  }
}

export const makeKvCache = <T>(kvKey: string, defaultTtl: number): KvCache<T> =>
  new KvCache<T>(kvKey, defaultTtl);
