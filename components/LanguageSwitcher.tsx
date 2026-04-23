import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../lib/i18n';
import { useIsMobile } from '../lib/useIsMobile';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const isMobile = useIsMobile();
  const current = (i18n.language || 'ko').slice(0, 2) as 'ko' | 'en' | 'zh';
  return (
    <select
      aria-label="Language"
      value={current}
      onChange={(e) => changeLanguage(e.target.value as 'ko' | 'en' | 'zh')}
      style={{
        // appearance none → OS 네이티브 스타일 제거. 이게 없으면 모바일에서
        // 브라우저가 form control 최소 폰트 규칙을 적용해 우리 fontSize 를 무시함.
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `right ${isMobile ? '0.3rem' : '0.45rem'} center`,
        backgroundSize: '10px 6px',
        backgroundColor: 'var(--color-surface)',
        minHeight: isMobile ? 28 : 40,
        height: isMobile ? 28 : 40,
        lineHeight: 1,
        padding: isMobile ? '0 1rem 0 0.35rem' : '0 1.4rem 0 0.5rem',
        borderRadius: 6,
        border: '1px solid var(--color-gray)',
        color: 'var(--color-ink)',
        fontSize: isMobile ? '0.72rem' : '0.9rem',
        fontWeight: 700,
        cursor: 'pointer',
        maxWidth: isMobile ? 68 : undefined,
        boxSizing: 'border-box',
      }}
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
};

export default LanguageSwitcher;
