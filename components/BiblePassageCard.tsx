import { Fragment } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 성경 본문 표시 공용 카드 (큐티·통독·예배 및 모임교안 등에서 공용).
 *
 * design.md §2.1 표준 콘텐츠 카드 + 절 렌더 규칙 준수.
 *
 * props.passageText 포맷:
 *   - 장 헤더: `[N장]` 한 줄
 *   - 절: `N ...본문...` (공백 구분)
 *   - 그 외 라인은 들여쓰기된 본문으로 처리
 */
type Props = {
  reference: string;           // 예: "창세기 28:1-22"
  passageText: string;
  sourceLabel?: string;        // 기본 "개역한글 · 공공영역"
};

const BiblePassageCard = ({ reference, passageText, sourceLabel = '개역한글 · 공공영역' }: Props) => {
  const isMobile = useIsMobile();
  const lines = passageText.split('\n');
  const blocks: Array<{ chapter?: string; verse?: string; text?: string }> = [];
  for (const line of lines) {
    const chMatch = /^\[(\d+)장\]$/.exec(line.trim());
    if (chMatch) { blocks.push({ chapter: chMatch[1] }); continue; }
    const vMatch = /^(\d+)\s+(.+)$/.exec(line.trim());
    if (vMatch) { blocks.push({ verse: vMatch[1], text: vMatch[2] }); continue; }
    if (line.trim()) blocks.push({ text: line.trim() });
  }

  return (
    <div style={{ padding: isMobile ? '0.85rem 0.85rem' : '1.1rem 1.2rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.6rem', borderBottom: '1px solid #ECFCCB', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span aria-hidden style={{ fontSize: isMobile ? '0.95rem' : '1rem' }}>📖</span>
          <strong style={{ fontSize: isMobile ? '0.92rem' : '0.98rem', color: '#3F6212', fontWeight: 800 }}>성경말씀</strong>
          <span style={{ fontSize: isMobile ? '0.82rem' : '0.88rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{reference}</span>
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.25rem 0.7rem',
          borderRadius: 999,
          border: '1px solid #D9F09E',
          background: '#ECFCCB',
          color: '#3F6212',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}>
          {sourceLabel}
        </span>
      </div>
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
    </div>
  );
};

export default BiblePassageCard;
