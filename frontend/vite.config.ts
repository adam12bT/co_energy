import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()], base: './',
    server: { host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: { '/api': { target: env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000', changeOrigin: true } } },
    build: { chunkSizeWarningLimit: 750, rollupOptions: { output: { manualChunks: { 'react-vendor': ['react','react-dom','react-router-dom'], charts: ['recharts'] } } } },
  };
});
