import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Google Cloud Text-to-Speech proxy (Phase 2).
 *
 * POST /api/tts
 *   body: { text: string, voice?: string }
 *   → audio/mpeg (MP3) binary
 *
 * Env:
 *   GOOGLE_TTS_API_KEY — Google Cloud TTS API key (restrict to Text-to-Speech API + HTTP referrer)
 *
 * Note (POC): MP3 캐싱은 용량 문제로 KV 영속 저장 생략. warm lambda 메모리에만 LRU 보관.
 * 비용 최적화 필요 시 Supabase Storage 버킷으로 이동.
 */

type TtsBody = { text?: unknown; voice?: unknown };

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const DEFAULT_VOICE = 'ko-KR-Wavenet-D'; // 남성음, 또렷한 톤. 대안: Wavenet-C (더 깊음), Neural2-B (현대적)
const MAX_BYTES = 4500; // Google TTS 단일 요청 한도 ~5000bytes 안전 마진

// 간단한 warm-lambda LRU (최대 40개). 콜드스타트 시 리셋됨 — 그래도 동일 구절을 반복해서 듣는 사용자에게 도움.
const mem = new Map<string, Buffer>();
const MEM_LIMIT = 40;
const memPut = (k: string, v: Buffer) => {
  if (mem.has(k)) mem.delete(k);
  mem.set(k, v);
  while (mem.size > MEM_LIMIT) {
    const first = mem.keys().next().value;
    if (first) mem.delete(first);
    else break;
  }
};

const hashKey = async (text: string, voice: string): Promise<string> => {
  const buf = new TextEncoder().encode(`${voice}::${text}`);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    console.error('[tts] GOOGLE_TTS_API_KEY not set');
    return res.status(503).json({ error: 'TTS not configured', errorReason: 'GOOGLE_TTS_API_KEY missing' });
  }

  const body = (req.body || {}) as TtsBody;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : DEFAULT_VOICE;
  if (!text) return res.status(400).json({ error: 'text required' });
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BYTES) {
    return res.status(400).json({ error: `text too long (${bytes}B > ${MAX_BYTES}B). 클라이언트에서 절 단위로 분할해 주세요.` });
  }

  try {
    const key = await hashKey(text, voice);
    const cached = mem.get(key);
    if (cached) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-KCIS-TTS-Cache', 'hit');
      return res.status(200).send(cached);
    }

    const r = await fetch(`${TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'ko-KR', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1, pitch: 0 },
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[tts] google error', r.status, errText.slice(0, 300));
      return res.status(502).json({ error: 'Google TTS failed', errorReason: `google ${r.status}`, detail: errText.slice(0, 300) });
    }
    const j = (await r.json()) as { audioContent?: string };
    if (!j.audioContent) {
      console.error('[tts] google no audioContent');
      return res.status(502).json({ error: 'no audioContent' });
    }
    const audio = Buffer.from(j.audioContent, 'base64');
    memPut(key, audio);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-KCIS-TTS-Cache', 'miss');
    return res.status(200).send(audio);
  } catch (e: any) {
    console.error('[tts] failed', e);
    return res.status(500).json({ error: 'tts failed', errorReason: e?.message || String(e) });
  }
};

export default handler;
