import { Fragment } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import { useBibleLang, BibleLangView } from '../lib/useBibleLang';

/**
 * 성경 본문 표시 공용 카드 (큐티·통독·구역모임교안 등에서 공용).
 * 한글(개역한글)·영문(KJV) 중 단일 또는 동시 표시 지원 — 사용자의 언어 토글(useBibleLang)에 반응.
 *
 * design.md §2.1 표준 콘텐츠 카드 + 절 렌더 규칙 준수.
 *
 * passage 텍스트 포맷:
 *   - 장 헤더: `[N장]` 한 줄
 *   - 절: `N ...본문...` (공백 구분)
 *   - 그 외 라인은 들여쓰기된 본문으로 처리
 */
type Props = {
  reference: string;           // 예: "창세기 28:1-22"
  /** 한글 본문 (개역한글) */
  koText?: string | null;
  /** 영문 본문 (KJV) */
  enText?: string | null;
  /** 구버전 호환용 단일 본문 (한글로 취급) */
  passageText?: string | null;
  /**
   * 데이터 출처 표기 — 참조 추출처 + 본문 번역.
   * 예: "매일성경 · 개역한글/KJV(공공영역)"
   * 헤더 아래에 회색 텍스트로 노출.
   */
  source?: string | null;
};

type Block = { chapter?: string; verse?: string; text?: string };

const parseBlocks = (text: string): Block[] => {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const chKo = /^\[(\d+)장\]$/.exec(trimmed);
    if (chKo) { blocks.push({ chapter: chKo[1] }); continue; }
    const chEn = /^\[(\d+)\]$/.exec(trimmed);
    if (chEn) { blocks.push({ chapter: chEn[1] }); continue; }
    const v = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (v) { blocks.push({ verse: v[1], text: v[2] }); continue; }
    blocks.push({ text: trimmed });
  }
  return blocks;
};

const BiblePassageCard = ({ reference, koText, enText, passageText, source }: Props) => {
  const isMobile = useIsMobile();
  const [lang, setLang] = useBibleLang();

  const effectiveKo = koText ?? passageText ?? null;
  const effectiveEn = enText ?? null;
  const hasKo = !!effectiveKo;
  const hasEn = !!effectiveEn;

  // 실제 표시 언어 — 선택값 + 보유 여부에 따라 보정.
  const resolved: BibleLangView = (() => {
    if (lang === 'both') {
      if (hasKo && hasEn) return 'both';
      if (hasKo) return 'ko';
      if (hasEn) return 'en';
      return 'ko';
    }
    if (lang === 'en' && !hasEn) return 'ko';
    if (lang === 'ko' && !hasKo && hasEn) return 'en';
    return lang;
  })();

  const koBlocks = hasKo ? parseBlocks(effectiveKo!) : [];
  const enBlocks = hasEn ? parseBlocks(effectiveEn!) : [];

  // 한·영 "모두" 모드용 병합 — 장/절 번호 기준으로 zip. 한쪽에만 존재하는 절도 fallback 처리.
  type MergedItem =
    | { kind: 'chapter'; num: string }
    | { kind: 'verse'; num: string; ko?: string; en?: string };
  const mergedItems: MergedItem[] = (() => {
    if (!(hasKo && hasEn)) return [];
    type Bucket = { num: string; ko: Map<string, string>; en: Map<string, string>; verseOrder: string[] };
    const chapters: Bucket[] = [];
    const ensure = (num: string): Bucket => {
      const found = chapters.find((c) => c.num === num);
      if (found) return found;
      const next: Bucket = { num, ko: new Map(), en: new Map(), verseOrder: [] };
      chapters.push(next);
      return next;
    };
    // ko pass
    let cur: Bucket | null = null;
    for (const b of koBlocks) {
      if (b.chapter) { cur = ensure(b.chapter); continue; }
      if (b.verse) {
        if (!cur) cur = ensure('1');
        cur.ko.set(b.verse, b.text || '');
        if (!cur.verseOrder.includes(b.verse)) cur.verseOrder.push(b.verse);
      }
    }
    // en pass (별도 커서)
    cur = null;
    for (const b of enBlocks) {
      if (b.chapter) { cur = ensure(b.chapter); continue; }
      if (b.verse) {
        if (!cur) cur = ensure('1');
        cur.en.set(b.verse, b.text || '');
        if (!cur.verseOrder.includes(b.verse)) cur.verseOrder.push(b.verse);
      }
    }
    const out: MergedItem[] = [];
    for (const c of chapters) {
      out.push({ kind: 'chapter', num: c.num });
      const sortedVerses = [...c.verseOrder].sort((a, b) => Number(a) - Number(b));
      for (const v of sortedVerses) {
        out.push({ kind: 'verse', num: v, ko: c.ko.get(v), en: c.en.get(v) });
      }
    }
    return out;
  })();

  const toggleOptions: Array<{ key: BibleLangView; label: string; disabled?: boolean }> = [
    { key: 'ko', label: '개역한글', disabled: !hasKo },
    { key: 'en', label: 'KJV', disabled: !hasEn },
    { key: 'both', label: '모두', disabled: !(hasKo && hasEn) },
  ];

  const renderBlocks = (blocks: Block[]) => (
    <div style={{ display: 'grid', gap: '0.5rem', color: 'var(--color-ink)', fontSize: isMobile ? '1rem' : '0.97rem', lineHeight: isMobile ? 1.85 : 1.85 }}>
      {blocks.map((b, i) => {
        const prev = i > 0 ? blocks[i - 1] : null;
        const showDivider = !!(b.verse && prev?.verse);
        let content;
        if (b.chapter) {
          content = (
            <div style={{ marginTop: i === 0 ? 0 : '0.8rem', marginBottom: '0.2rem' }}>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.9rem',
                borderRadius: 999,
                background: '#65A30D',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}>
                {b.chapter}장
              </span>
            </div>
          );
        } else if (b.verse) {
          content = (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1.5rem 1fr' : '2rem 1fr', columnGap: isMobile ? '0.3rem' : '0.4rem', alignItems: 'baseline' }}>
              <span style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', color: '#65A30D', fontWeight: 700, textAlign: 'right' }}>{b.verse}</span>
              <p style={{ margin: 0 }}>{b.text}</p>
            </div>
          );
        } else {
          content = <p style={{ margin: 0, paddingLeft: isMobile ? '1.8rem' : '2.4rem' }}>{b.text}</p>;
        }
        return (
          <Fragment key={i}>
            {showDivider && <div aria-hidden style={{ borderTop: '1px dotted rgba(101,163,13,0.3)' }} />}
            {content}
          </Fragment>
        );
      })}
    </div>
  );

  // 병합 렌더: 한·영 동시 모드 전용. 모든 화면 (PC/태블릿/모바일) 에서 절 단위 인터리브.
  const renderMerged = (items: MergedItem[]) => (
    <div style={{ display: 'grid', gap: '0.5rem', color: 'var(--color-ink)', fontSize: isMobile ? '1rem' : '0.97rem', lineHeight: 1.75 }}>
      {items.map((item, i) => {
        if (item.kind === 'chapter') {
          return (
            <div key={`ch-${i}`} style={{ marginTop: i === 0 ? 0 : '0.8rem', marginBottom: '0.2rem' }}>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.9rem',
                borderRadius: 999,
                background: '#65A30D',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}>
                {item.num}장
              </span>
            </div>
          );
        }
        const prev = i > 0 ? items[i - 1] : null;
        const showDivider = prev?.kind === 'verse';
        return (
          <Fragment key={`v-${i}`}>
            {showDivider && <div aria-hidden style={{ borderTop: '1px dotted rgba(101,163,13,0.3)' }} />}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1.5rem 1fr' : '2rem 1fr', columnGap: isMobile ? '0.3rem' : '0.4rem', alignItems: 'baseline' }}>
              <span style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', color: '#65A30D', fontWeight: 700, textAlign: 'right' }}>{item.num}</span>
              <div style={{ display: 'grid', gap: '0.2rem', minWidth: 0 }}>
                {item.ko && <p style={{ margin: 0, color: 'var(--color-ink)' }}>{item.ko}</p>}
                {item.en && (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: isMobile ? '0.9rem' : '0.88rem', lineHeight: 1.7, fontStyle: 'italic' }}>
                    {item.en}
                  </p>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '0.85rem' : '1.1rem 1.2rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
      {source && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <span aria-hidden>🔗</span>
          <span>데이터 출처: {source}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.6rem', borderBottom: '1px solid #ECFCCB', flexWrap: 'wrap' }}>
        <span style={{
          padding: '0.38rem 0.85rem',
          borderRadius: 999,
          border: '1px solid #65A30D',
          background: '#fff',
          color: '#3F6212',
          fontSize: '0.86rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}>
          <span aria-hidden>📖</span>
          <span>{reference}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(hasKo || hasEn) && (
            <span role="group" aria-label="성경 언어" style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: '1px solid #D9F09E' }}>
              {toggleOptions.map((opt) => {
                const active = resolved === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => !opt.disabled && setLang(opt.key)}
                    disabled={opt.disabled}
                    style={{
                      padding: isMobile ? '0.5rem 0.75rem' : '0.2rem 0.6rem',
                      border: 'none',
                      background: active ? '#65A30D' : '#F7FEE7',
                      color: active ? '#fff' : opt.disabled ? '#B7C5A3' : '#3F6212',
                      fontSize: isMobile ? '0.78rem' : '0.72rem',
                      fontWeight: 800,
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.55 : 1,
                      letterSpacing: '0.02em',
                      minHeight: isMobile ? 40 : undefined,
                    }}
                  >{opt.label}</button>
                );
              })}
            </span>
          )}
        </span>
      </div>

      {resolved === 'both' ? (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ display: 'inline-flex', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 700, color: '#65A30D' }}>
            <span>개역한글</span><span style={{ opacity: 0.55 }}>·</span><span style={{ fontStyle: 'italic' }}>KJV</span>
          </div>
          {renderMerged(mergedItems)}
        </div>
      ) : resolved === 'en' ? (
        renderBlocks(enBlocks)
      ) : (
        renderBlocks(koBlocks)
      )}
    </div>
  );
};

export default BiblePassageCard;
