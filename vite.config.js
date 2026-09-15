import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleCdxRequest } from './server/cdxProxy.mjs';

function cdxProxyPlugin() {
  return {
    name: 'internet-time-machine-cdx-proxy',
    configureServer(server) {
      server.middlewares.use('/api/wayback', handleCdxRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/wayback', handleCdxRequest);
    },
  };
}

export default defineConfig({
  plugins: [react(), cdxProxyPlugin()],
});
