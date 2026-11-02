import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: `.cache/vite-${process.env.MISAKI_UI_PORT || 1420}`,
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: Number(process.env.MISAKI_UI_PORT || 1420), strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${Number(process.env.MISAKI_BRIDGE_PORT || 8765)}`,
        rewrite: path => path.replace(/^\/api/, ''),
        configure(proxy) {
          proxy.on('proxyReq', req => {
            if (process.env.MISAKI_SESSION_TOKEN) req.setHeader('Authorization', `Bearer ${process.env.MISAKI_SESSION_TOKEN}`);
          });
        },
      },
    },
  },
  clearScreen: false,
});
