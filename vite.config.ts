import { defineConfig } from 'vite'

// Relative base: the same build works at the custom domain root (philippmatth.es/)
// and under the project path (philippmatthes.github.io/homepage/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
