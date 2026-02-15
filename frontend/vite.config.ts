import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            monaco: ['modern-monaco'],
            icons: ['developer-icons', 'lucide-react'],
            recharts: ['recharts'],
            jspdf: ['jspdf'],
            prism: ['prism-react-renderer'],
            vendor: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
