import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF4EF',
          100: '#FFE5D8',
          200: '#FFC7AF',
          300: '#FFA37F',
          400: '#FF7B4A',
          500: '#FF6B35',
          600: '#E8402A',
          700: '#C22D1C',
          800: '#9A2519',
          900: '#7A221A',
        },
        /* Butter 风活力辅助色（用于 chips、统计数字、图标点缀） */
        butter: { DEFAULT: '#FFD84D', 600: '#9A7B00' },
        lime: { DEFAULT: '#A3E635', 600: '#4D7C0F' },
        violet: { DEFAULT: '#A78BFA', 600: '#7C3AED' },
        pink: { DEFAULT: '#F472B6', 600: '#DB2777' },
        sky: { DEFAULT: '#38BDF8', 600: '#0284C7' },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #FF6B35 0%, #FFB53A 100%)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'PingFang SC',
          'Microsoft YaHei',
          'Hiragino Sans GB',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35)',
        'card-hover':
          '0 2px 4px rgba(0, 0, 0, 0.4), 0 20px 48px rgba(0, 0, 0, 0.45)',
        'glow-brand': '0 0 80px -12px rgba(255, 107, 53, 0.45)',
        'glow-butter': '0 0 80px -12px rgba(255, 216, 77, 0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
