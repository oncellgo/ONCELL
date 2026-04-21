import { useEffect, useState } from 'react';

export type BibleLangView = 'ko' | 'en' | 'both';

const STORAGE_KEY = 'kcisBibleLang';
const EVENT = 'kcis-bible-lang';

const read = (): BibleLangView => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'ko' || v === 'en' || v === 'both') return v;
  } catch {}
  return 'ko';
};

/**
 * 성경 본문 표시 언어 토글. 한 화면의 카드들이 동기화되도록
 * localStorage + CustomEvent로 전역 브로드캐스트한다.
 */
export const useBibleLang = (): [BibleLangView, (next: BibleLangView) => void] => {
  const [lang, setLangState] = useState<BibleLangView>('ko');

  useEffect(() => {
    setLangState(read());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BibleLangView>).detail;
      if (detail === 'ko' || detail === 'en' || detail === 'both') setLangState(detail);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setLang = (next: BibleLangView) => {
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
    setLangState(next);
  };

  return [lang, setLang];
};
