import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false,
    allowedHosts: ['intuteai.up.railway.app'], // Add the host here
    proxy: {
      '/api': {
        target: 'https://crmbackend-production-c426.up.railway.app',
        changeOrigin: true,
        secure: true
      }
    }
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer]
    }
  },
  build: {
    outDir: 'dist'
  }
});