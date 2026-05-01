import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../lib/i18n';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 언어 스위처 — 네이티브 <select> 는 모바일 OS 가 최소 크기를 강제하기 때문에
 * 커스텀 버튼 + 드롭다운으로 구현해 크기를 완전 제어한다.
 */

type Lang = 'ko' | 'en' | 'zh';

const OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: 'ko', label: '한국어', short: '한' },
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'zh', label: '中文', short: '中' },
];

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const current = (i18n.language || 'ko').slice(0, 2) as Lang;
  const currentOption = OPTIONS.find((o) => o.value === current) || OPTIONS[0];

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const pick = (v: Lang) => {
    setOpen(false);
    if (v !== current) changeLanguage(v);
  };

  // 모바일: 초소형 pill · 데스크톱: 기존과 유사
  const buttonHeight = isMobile ? 26 : 36;
  const buttonFontSize = isMobile ? '0.7rem' : '0.88rem';
  const buttonPadding = isMobile ? '0 0.4rem 0 0.5rem' : '0 0.6rem 0 0.7rem';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2rem',
          height: buttonHeight,
          minHeight: buttonHeight,
          padding: buttonPadding,
          borderRadius: 999,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-ink)',
          fontSize: buttonFontSize,
          fontWeight: 700,
          cursor: 'pointer',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        }}
      >
        <span>{isMobile ? currentOption.short : currentOption.label}</span>
        <span aria-hidden style={{ fontSize: '0.7em', color: 'var(--color-ink-2)', lineHeight: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Language options"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            minWidth: 110,
            background: '#fff',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 110,
          }}
        >
          {OPTIONS.map((o) => {
            const active = o.value === current;
            return (
              <li key={o.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(o.value)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    minHeight: 36,
                    padding: '0.4rem 0.6rem',
                    borderRadius: 6,
                    border: 'none',
                    background: active ? 'var(--color-primary-tint)' : 'transparent',
                    color: active ? 'var(--color-primary-deep)' : 'var(--color-ink)',
                    fontSize: '0.85rem',
                    fontWeight: active ? 800 : 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span>{o.label}</span>
                  {active && <span aria-hidden style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LanguageSwitcher;
