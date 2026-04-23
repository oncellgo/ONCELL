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
        minHeight: isMobile ? 32 : 40,
        padding: isMobile ? '0.2rem 0.25rem' : '0.45rem 0.5rem',
        borderRadius: 8,
        border: '1px solid var(--color-gray)',
        background: 'var(--color-surface)',
        color: 'var(--color-ink)',
        fontSize: isMobile ? '0.72rem' : '0.9rem',
        fontWeight: 700,
        cursor: 'pointer',
        maxWidth: isMobile ? 70 : undefined,
      }}
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
};

export default LanguageSwitcher;
