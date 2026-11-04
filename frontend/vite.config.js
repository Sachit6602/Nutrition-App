import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: API paths go to the Worker running under `wrangler dev` on 3001 (see backend/wrangler.jsonc).
// These prefixes must match assets.run_worker_first there.
const api = { target: 'http://localhost:3001', changeOrigin: true }

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': api, '/auth': api, '/me': api, '/ai': api, '/health': api },
  },
})
