/**
 * Steward+AI. Design Tokens — Single Source of Truth
 *
 * 모든 페이지의 색상·폰트·배경·그림자·반경을 여기서 관리합니다.
 * 값 하나를 바꾸면 전체 서비스에 일괄 반영됩니다.
 *
 * 사용법:
 *  - TS/TSX 인라인 스타일:  theme.color.primary, theme.shadow.card 등
 *  - CSS / CSS Modules:     var(--color-primary), var(--shadow-card) 등
 *    (_app.tsx가 theme → :root CSS 변수로 주입합니다.)
 */

export const theme = {
  color: {
    primary: '#20CD8D',
    primaryHover: '#1AB67B',
    primaryTint: '#CCF4E5',
    primaryDeep: '#0F7A52',

    ink: '#182527',
    ink2: '#2D4048',
    gray: '#D9D9D9',
    surface: '#FFFFFF',
    surfaceMuted: '#F6FBF9',
    surfaceBorder: '#E7F3EE',

    danger: '#b91c1c',
    dangerBg: '#fee2e2',

    // Warm accents — 따뜻함·활기를 위한 보조 컬러
    coral: '#FF8A65',
    coralTint: '#FFE5DB',
    coralDeep: '#C94F2E',
    gold: '#FFC857',
    goldTint: '#FFF3D1',
    goldDeep: '#A67B00',
  },

  // 글로벌 격자 배경 (body에 고정 적용)
  background: {
    base: '#5BD4A0',
    gridLine: 'rgba(255, 255, 255, 0.35)',
    gridSize: '18px',
  },

  font: {
    family: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    size: {
      xs: '0.78rem',
      sm: '0.88rem',
      base: '0.95rem',
      lg: '1.1rem',
      xl: '1.35rem',
      '2xl': '1.75rem',
    },
    weight: { regular: 500, semibold: 600, bold: 700, heavy: 800 },
  },

  radius: {
    sm: '8px',
    md: '10px',
    lg: '12px',
    xl: '16px',
    pill: '999px',
  },

  shadow: {
    card: '0 12px 32px rgba(24, 37, 39, 0.06)',
    cardLg: '0 20px 40px rgba(24, 37, 39, 0.18)',
    button: '0 10px 22px rgba(32, 205, 141, 0.28)',
  },

  // 아이콘 / 뱃지 공용 스타일
  icon: {
    tint: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      height: 44,
      borderRadius: 12,
      background: '#CCF4E5',
      color: '#0F7A52',
      fontSize: '1.2rem',
    } as const,
    brandMark: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 8,
      background: '#20CD8D',
      color: '#FFFFFF',
      fontWeight: 900,
      fontSize: '0.9rem',
    } as const,
  },

  badge: {
    mint: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.3rem 0.7rem',
      borderRadius: 999,
      background: '#CCF4E5',
      color: '#0F7A52',
      fontWeight: 700,
      fontSize: '0.78rem',
    } as const,
  },
} as const;

export type Theme = typeof theme;

/**
 * theme → :root CSS 변수 문자열
 * _app.tsx가 이 결과를 <style>로 주입합니다.
 */
export const themeCssVars = `
  :root {
    --color-primary: ${theme.color.primary};
    --color-primary-hover: ${theme.color.primaryHover};
    --color-primary-tint: ${theme.color.primaryTint};
    --color-primary-deep: ${theme.color.primaryDeep};

    --color-ink: ${theme.color.ink};
    --color-ink-2: ${theme.color.ink2};
    --color-gray: ${theme.color.gray};
    --color-surface: ${theme.color.surface};
    --color-surface-muted: ${theme.color.surfaceMuted};
    --color-surface-border: ${theme.color.surfaceBorder};

    --color-danger: ${theme.color.danger};
    --color-danger-bg: ${theme.color.dangerBg};

    --color-coral: ${theme.color.coral};
    --color-coral-tint: ${theme.color.coralTint};
    --color-coral-deep: ${theme.color.coralDeep};
    --color-gold: ${theme.color.gold};
    --color-gold-tint: ${theme.color.goldTint};
    --color-gold-deep: ${theme.color.goldDeep};

    --bg-base: ${theme.background.base};
    --bg-grid-line: ${theme.background.gridLine};
    --bg-grid-size: ${theme.background.gridSize};

    --font-sans: ${theme.font.family};

    --radius-sm: ${theme.radius.sm};
    --radius-md: ${theme.radius.md};
    --radius-lg: ${theme.radius.lg};
    --radius-xl: ${theme.radius.xl};
    --radius-pill: ${theme.radius.pill};

    --shadow-card: ${theme.shadow.card};
    --shadow-card-lg: ${theme.shadow.cardLg};
    --shadow-button: ${theme.shadow.button};
  }
`;
