import { Color } from 'three'
import { palette } from '../core/palette'
import { PORTRAIT_CENTER, PORTRAIT_DEPTH, PORTRAIT_SIZE } from '../world/layout'

interface Img {
  w: number
  h: number
  data: Uint8ClampedArray
}

export async function loadPixels(src: string): Promise<Img> {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data }
}

/** Bilinear sample of channel `ch` at uv ∈ [0,1]², returns 0..1. */
export function sample(img: Img, u: number, v: number, ch: number) {
  const x = Math.min(img.w - 1.001, Math.max(0, u * img.w - 0.5))
  const y = Math.min(img.h - 1.001, Math.max(0, v * img.h - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const i = (xx: number, yy: number) => img.data[(yy * img.w + xx) * 4 + ch]
  const a = i(x0, y0) * (1 - fx) + i(x0 + 1, y0) * fx
  const b = i(x0, y0 + 1) * (1 - fx) + i(x0 + 1, y0 + 1) * fx
  return (a * (1 - fy) + b * fy) / 255
}

/**
 * Soft elliptical vignette around the head and shoulders: 1 in the middle,
 * falling to 0 well before the photo's borders, so no edge is ever visible.
 */
function vignette(u: number, v: number) {
  const dx = (u - 0.5) / 0.52
  const dy = (v - 0.5) / 0.56
  const r = Math.sqrt(dx * dx + dy * dy)
  const bottom = 1 - Math.min(1, Math.max(0, (v - 0.8) / 0.19))
  const t = Math.min(1, Math.max(0, (1 - r) / 0.45))
  return t * t * (3 - 2 * t) * bottom * bottom
}

/** Share of points that are visible in the portrait (the rest appear as they fly off). */
const PORTRAIT_SHARE = 0.42

/**
 * Turns the photo + depth map into a LiDAR-style point cloud: most points
 * lie on horizontal scan rows (like a spinning sensor), the rest fill in.
 * Background (depth ≈ 0) is culled, density thins out towards the edges.
 */
export async function samplePortrait(count: number, photoUrl: string, depthUrl: string) {
  const [photo, depth] = await Promise.all([loadPixels(photoUrl), loadPixels(depthUrl)])
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const vis = new Float32Array(count)
  // Keep enough scan rows for the LiDAR look even with a lean particle budget.
  const rows = Math.max(90, Math.round(Math.sqrt(count) * 0.55))
  const tint = new Color()
  const dark = palette.deep.clone().multiplyScalar(0.9)
  const DEPTH_CUTOFF = 0.2

  let n = 0
  let guard = 0
  while (n < count && guard++ < count * 40) {
    const u = Math.random()
    let v: number
    if (Math.random() < 0.72) {
      const r = Math.floor(Math.random() * rows)
      v = (r + 0.5) / rows + (Math.random() - 0.5) * 0.0012
    } else {
      v = Math.random()
    }
    const w = vignette(u, v)
    if (Math.random() > w) continue
    const d = sample(depth, u, v, 0)
    if (d < DEPTH_CUTOFF) continue
    // Soften the silhouette: fewer points where depth is falling off.
    if (d < DEPTH_CUTOFF * 1.4 && Math.random() > (d - DEPTH_CUTOFF) / (DEPTH_CUTOFF * 0.4)) continue

    const r = sample(photo, u, v, 0)
    const g = sample(photo, u, v, 1)
    const b = sample(photo, u, v, 2)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const l = Math.pow(lum, 1.25)
    tint.copy(dark).lerp(palette.ice, l)
    tint.lerp(palette.white, Math.pow(lum, 5) * 0.7)
    const k = 0.55 + 0.55 * d
    col[n * 3] = tint.r * k
    col[n * 3 + 1] = tint.g * k
    col[n * 3 + 2] = tint.b * k

    // Visible share, with brightness fading further out for a soft falloff.
    vis[n] = Math.random() < PORTRAIT_SHARE ? 0.35 + 0.65 * w : 0

    pos[n * 3] = PORTRAIT_CENTER.x + (u - 0.5) * PORTRAIT_SIZE
    pos[n * 3 + 1] = PORTRAIT_CENTER.y + (0.5 - v) * PORTRAIT_SIZE
    pos[n * 3 + 2] = PORTRAIT_CENTER.z + (d - 0.5) * PORTRAIT_DEPTH + (Math.random() - 0.5) * 0.01
    n++
  }
  // In the unlikely case the guard tripped, duplicate existing points.
  for (let i = n; i < count; i++) {
    const j = Math.floor(Math.random() * Math.max(1, n))
    pos.copyWithin(i * 3, j * 3, j * 3 + 3)
    col.copyWithin(i * 3, j * 3, j * 3 + 3)
  }
  return { pos, col, vis }
}
