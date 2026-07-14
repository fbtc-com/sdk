import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Expose ETH_RPC_URL / MANTLE_RPC_URL to the browser (in addition to VITE_*).
  envPrefix: ['VITE_', 'ETH_', 'MANTLE_'],
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});
