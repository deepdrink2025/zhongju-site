import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/contracts/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/contract': 'http://127.0.0.1:8790',
    },
  },
});
