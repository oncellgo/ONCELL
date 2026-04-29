import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'rgba(255,255,255,0.16)',
        input: 'rgba(255,255,255,0.18)',
        ring: '#A5F3FC',
        background: '#2D3850',
        foreground: '#FFFFFF',
        primary: {
          DEFAULT: '#A5F3FC',
          foreground: '#2D3850',
        },
        secondary: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          foreground: 'rgba(255,255,255,0.6)',
        },
        accent: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          foreground: '#FFFFFF',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        card: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          foreground: '#FFFFFF',
        },
        popover: {
          DEFAULT: '#2D3850',
          foreground: '#FFFFFF',
        },
      },
      borderRadius: {
        lg: '16px',
        md: '12px',
        sm: '8px',
      },
    },
  },
  plugins: [],
};

export default config;
