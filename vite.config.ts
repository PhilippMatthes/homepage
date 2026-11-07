import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const SITE = 'https://philippmatth.es'

const text = (h: string) =>
  h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const attr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Crawlers ignore #hash, so every chapter also gets a tiny page at /<id>/
 * with its own title, description and preview image (public/og/<id>.jpg,
 * rendered by scripts/og.mjs) that forwards visitors to /#<id>.
 */
function chapterPages(): Plugin {
  return {
    name: 'chapter-pages',
    apply: 'build',
    generateBundle() {
      const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
      const menu = new Map([...html.matchAll(/<a href="#([\w-]+)" data-goto="[\d.]+">([^<]+)<\/a>/g)].map((m) => [m[1], text(m[2])]))
      for (const [, id, body] of html.matchAll(/<section class="chapter[^"]*" id="([\w-]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
        const name = menu.get(id) ?? id
        const h2 = body.match(/<h2>([\s\S]*?)<\/h2>/)
        const proj = h2?.[1].match(/<span class="proj">([\s\S]*?)<\/span>/)
        const tagline = h2 ? text(h2[1].replace(/<span class="proj">[\s\S]*?<\/span>/, '')).replace(/\.$/, '') : ''
        const lead = text(body.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1] ?? '')
        const title = `${proj ? text(proj[1]) : name}: ${tagline || name} · Philipp Matthes`
        const description = lead.length > 200 ? lead.slice(0, lead.lastIndexOf(' ', 197)) + '…' : lead
        const source = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${attr(title)}</title>
<meta name="description" content="${attr(description)}" />
<link rel="canonical" href="${SITE}/#${id}" />
<meta property="og:title" content="${attr(title)}" />
<meta property="og:description" content="${attr(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${SITE}/${id}/" />
<meta property="og:image" content="${SITE}/og/${id}.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0; url=../#${id}" />
<script>location.replace('../' + location.search + '#${id}')</script>
</head>
<body><a href="../#${id}">${attr(name)}</a></body>
</html>
`
        this.emitFile({ type: 'asset', fileName: `${id}/index.html`, source })
      }
    },
  }
}

// Relative base: the same build works at the custom domain root (philippmatth.es/)
// and under the project path (philippmatthes.github.io/homepage/).
export default defineConfig({
  base: './',
  plugins: [chapterPages()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
