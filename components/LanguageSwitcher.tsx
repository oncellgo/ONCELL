import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../lib/i18n';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const current = (i18n.language || 'ko').slice(0, 2) as 'ko' | 'en' | 'zh';
  return (
    <select
      aria-label="Language"
      value={current}
      onChange={(e) => changeLanguage(e.target.value as 'ko' | 'en' | 'zh')}
      style={{
        padding: '0.35rem 0.5rem',
        borderRadius: 8,
        border: '1px solid var(--color-gray)',
        background: 'var(--color-surface)',
        color: 'var(--color-ink)',
        fontSize: '0.8rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
};

export default LanguageSwitcher;
