import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, /api vai direto para o scanservjs.
// Defina SCANSERV_URL em .env.local (ex.: SCANSERV_URL=http://192.168.0.10:8080).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: { proxy: { '/api': env.SCANSERV_URL || 'http://localhost:8080' } },
    build: { chunkSizeWarningLimit: 1600 }
  };
});
