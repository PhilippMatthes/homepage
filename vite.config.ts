import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

/**
 * Replaces {{stat:path.to.value}} in index.html with numbers from
 * src/generated/stats.json (refreshed by scripts/fetch-stats.mjs in CI),
 * so live GitHub numbers are in the static HTML for crawlers and reader mode too.
 */
function stats(): Plugin {
  const file = new URL('./src/generated/stats.json', import.meta.url)
  const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
  return {
    name: 'stats',
    configureServer(server) {
      server.watcher.add(file.pathname)
    },
    transformIndexHtml(html) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      return html.replace(/\{\{stat:([\w.]+)\}\}/g, (_, path: string) => {
        const v = path.split('.').reduce((o: any, k) => o?.[k], data)
        if (typeof v !== 'number') throw new Error(`stats.json has no number at ${path}`)
        return v >= 10_000 ? fmt.format(v) : v.toLocaleString('en')
      })
    },
  }
}

// Relative base: the same build works at the custom domain root (philippmatth.es/)
// and under the project path (philippmatthes.github.io/homepage/).
export default defineConfig({
  base: './',
  plugins: [stats()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
