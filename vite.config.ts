import { defineConfig } from 'vite'

// Served from the custom domain root (see public/CNAME), so base is '/'.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
