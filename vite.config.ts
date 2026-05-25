import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Target browsers modernos (iOS 15+, Chrome 90+) para bundle menor
    target: 'es2020',
    // Gera source maps apenas em dev
    sourcemap: false,
    // Limita chunks para evitar arquivos gigantes no mobile
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Separar o vendor (React, Lucide) do código do app para melhor caching
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@services': '/src/services',
      '@types': '/src/types',
      '@utils': '/src/utils',
    },
  },
});
