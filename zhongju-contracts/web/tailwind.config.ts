import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecf7f4',
          100: '#d2ebe4',
          500: '#17997e',
          600: '#0e7c66',
          700: '#0b6552',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
