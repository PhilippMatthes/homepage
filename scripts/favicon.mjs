// Renders the favicons from the Apple 💡 emoji. Needs macOS (for the Apple Color
// Emoji font); run after changing the icon and commit the results:
//
//   npm run favicon
//
// Writes public/favicon.ico (16 + 32), public/icons/favicon-{16x16,32x32}.png
// and public/icons/apple-icon-180x180.png.
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const EMOJI = '💡'

// Tab icons are transparent; the touch icon gets the site background because
// iOS fills transparency with black and adds its own rounded corners.
const icons = [
  { file: 'icons/favicon-16x16.png', size: 16 },
  { file: 'icons/favicon-32x32.png', size: 32 },
  { file: 'icons/apple-icon-180x180.png', size: 180, background: '#02040a', scale: 0.72 },
]

if (process.platform !== 'darwin') throw new Error('favicon: needs macOS for the Apple Color Emoji font')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent(`<span style="font: 160px 'Apple Color Emoji'">${EMOJI}</span>`)
  await page.evaluate(() => document.fonts.ready)
  const pngs = await page.evaluate(
    async ({ EMOJI, icons }) => {
      const out = []
      for (const { size, background, scale = 1 } of icons) {
        // Draw large once, then downscale: emoji bitmaps look best scaled down.
        const S = 640
        const c = new OffscreenCanvas(S, S)
        const g = c.getContext('2d')
        g.font = `${Math.round(S * 0.8 * scale)}px 'Apple Color Emoji'`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        // Center the glyph's actual ink box, not the font's line box.
        const m = g.measureText(EMOJI)
        const y = S / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
        g.fillText(EMOJI, S / 2, y)
        const small = new OffscreenCanvas(size, size)
        const sg = small.getContext('2d')
        if (background) {
          sg.fillStyle = background
          sg.fillRect(0, 0, size, size)
        }
        sg.imageSmoothingQuality = 'high'
        sg.drawImage(c, 0, 0, size, size)
        const blob = await small.convertToBlob({ type: 'image/png' })
        out.push([...new Uint8Array(await blob.arrayBuffer())])
      }
      return out
    },
    { EMOJI, icons },
  )

  const bufs = pngs.map((b) => Buffer.from(b))
  for (const [i, { file }] of icons.entries()) {
    await writeFile(new URL(`../public/${file}`, import.meta.url), bufs[i])
    console.log(`favicon: public/${file}`)
  }

  // favicon.ico with PNG-compressed 16 and 32 entries.
  const entries = icons.map((icon, i) => ({ ...icon, png: bufs[i] })).filter(({ size }) => size <= 32)
  const header = Buffer.alloc(6 + 16 * entries.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i
    header.writeUInt8(size, o)
    header.writeUInt8(size, o + 1)
    header.writeUInt16LE(1, o + 4) // planes
    header.writeUInt16LE(32, o + 6) // bpp
    header.writeUInt32LE(png.length, o + 8)
    header.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...entries.map((e) => e.png)]))
  console.log('favicon: public/favicon.ico')
} finally {
  await browser.close()
}
