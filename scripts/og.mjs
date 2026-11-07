// Renders social preview images (1200×630) for the cover and every chapter into
// public/og/<id>.jpg. Run locally after visual changes and commit the results:
//
//   npm run og
//
// Headless WebGL (SwiftShader) is too slow and flaky for CI, so CI only ships
// the committed images. Chapters and their scroll positions come from the
// menu in index.html (data-goto), so new chapters are picked up automatically.
import { mkdir, readFile } from 'node:fs/promises'
import { build, preview } from 'vite'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const shots = [
  { id: 'index', p: 0 },
  ...[...html.matchAll(/<a href="#([\w-]+)" data-goto="([\d.]+)"/g)].map(([, id, p]) => ({ id, p: Number(p) })),
]

await build({ root, logLevel: 'warn' })
const server = await preview({ root, preview: { port: 4179, strictPort: true } })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('page error:', e.message))
await mkdir(new URL('../public/og/', import.meta.url), { recursive: true })

try {
  for (const { id, p } of shots) {
    await page.goto(`http://localhost:4179/?og&quality=medium&p=${p}`)
    await page.waitForSelector('body.ready', { timeout: 90_000 })
    // Let the damped camera, fades and particle morphs settle.
    await page.waitForTimeout(4000)
    const path = new URL(`../public/og/${id}.jpg`, import.meta.url).pathname
    await page.screenshot({ path, type: 'jpeg', quality: 86 })
    console.log(`og: ${id} (p=${p}) → public/og/${id}.jpg`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
