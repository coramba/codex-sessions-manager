import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';
import fs from 'fs';
import path from 'path';

const sessionsIndex = () => ({
  name: 'sessions-index',
  configureServer(server) {
    server.middlewares.use('/__sessions_index', (req, res) => {
      const root =
        process.env.SESSIONS_ROOT_PATH ||
        path.resolve(process.cwd(), 'sessions');

      const files = [];
      const walk = (dir, base) => {
        const entries = fs.existsSync(dir)
          ? fs.readdirSync(dir, { withFileTypes: true })
          : [];
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(base, full).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            walk(full, base);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push({
              rel,
              url: `/sessions/${rel}`,
            });
          }
        }
      };

      walk(root, root);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(files));
    });
  },
});

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    vuetify(),
    sessionsIndex(),
  ],
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: Number(process.env.VITE_PORT) || 5172,
    strictPort: true,
    watch: {
      ignored: ['**/sessions/**'],
    },
  },
  envPrefix: ['VITE_', 'SESSIONS_'],
});
