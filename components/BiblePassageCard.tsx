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

const BiblePassageCard = ({ reference, koText, enText, passageText }: Props) => {
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

  const toggleOptions: Array<{ key: BibleLangView; label: string; disabled?: boolean }> = [
    { key: 'ko', label: '개역한글', disabled: !hasKo },
    { key: 'en', label: 'KJV', disabled: !hasEn },
    { key: 'both', label: '모두', disabled: !(hasKo && hasEn) },
  ];

  const renderBlocks = (blocks: Block[]) => (
    <div style={{ display: 'grid', gap: '0.5rem', color: 'var(--color-ink)', fontSize: isMobile ? '0.92rem' : '0.97rem', lineHeight: isMobile ? 1.75 : 1.85 }}>
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

  return (
    <div style={{ padding: isMobile ? '0.85rem' : '1.1rem 1.2rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.6rem', borderBottom: '1px solid #ECFCCB', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span aria-hidden style={{ fontSize: isMobile ? '0.95rem' : '1rem' }}>📖</span>
          <strong style={{ fontSize: isMobile ? '0.92rem' : '0.98rem', color: '#3F6212', fontWeight: 800 }}>성경말씀</strong>
          <span style={{ fontSize: isMobile ? '0.82rem' : '0.88rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{reference}</span>
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
                      padding: '0.2rem 0.6rem',
                      border: 'none',
                      background: active ? '#65A30D' : '#F7FEE7',
                      color: active ? '#fff' : opt.disabled ? '#B7C5A3' : '#3F6212',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.55 : 1,
                      letterSpacing: '0.02em',
                    }}
                  >{opt.label}</button>
                );
              })}
            </span>
          )}
        </span>
      </div>

      {resolved === 'both' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.9rem' : '1.2rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#65A30D', marginBottom: '0.4rem' }}>개역한글</div>
            {renderBlocks(koBlocks)}
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#65A30D', marginBottom: '0.4rem' }}>KJV</div>
            {renderBlocks(enBlocks)}
          </div>
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
