import { reducedMotion } from '../core/quality'

export interface Rect {
  x: number
  y: number
  size: number
}

const GRID = 84

/**
 * Boot screen: the portrait is "scanned in" as a LiDAR-style dot grid while
 * the real assets load. Each resolved load task advances the scan, and a slow
 * crawl covers waiting time in between. When the scene is ready, the grid
 * glides onto the WebGL portrait's screen position and the loader fades out,
 * so the two read as one image.
 */
export class Loader {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private dots: Array<{ u: number; v: number; lum: number; depth: number }> = []
  private total = 0
  private done = 0
  private crawl = 0
  private shown = 0
  private from: Rect = this.defaultRect()
  private to: Rect | null = null
  private moveT = 0
  private raf = 0
  private last = performance.now()

  constructor(photoUrl: string, depthUrl: string) {
    const root = document.getElementById('loader')
    if (!root) return
    root.prepend(this.canvas)
    this.resize()
    addEventListener('resize', this.resize)
    Promise.all([load(photoUrl), load(depthUrl)])
      .then(([photo, depth]) => (this.dots = sample(photo, depth)))
      .catch(() => {}) // keep the plain text loader
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Counts a load task; the scan advances when it settles. */
  track<T>(p: Promise<T>): Promise<T> {
    this.total++
    p.finally(() => this.done++).catch(() => {})
    return p
  }

  /**
   * Glides the grid onto `rect` (CSS px), completes the scan, then resolves.
   * Without a rect (the page opens on a chapter, not the cover), the grid
   * stays where it is and fades out with the loader.
   */
  finish(rect: Rect | null): Promise<void> {
    this.done = this.total
    this.to = rect ?? this.from
    const ms = reducedMotion || !this.dots.length || !rect ? 0 : 700
    return new Promise((resolve) =>
      setTimeout(() => {
        resolve()
        // Stop drawing once the CSS fade-out is over.
        setTimeout(() => {
          cancelAnimationFrame(this.raf)
          removeEventListener('resize', this.resize)
        }, 1400)
      }, ms),
    )
  }

  private defaultRect(): Rect {
    const size = Math.min(innerWidth * 0.8, innerHeight * 0.55)
    return { x: (innerWidth - size) / 2, y: innerHeight * 0.4 - size / 2, size }
  }

  private resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.canvas.width = innerWidth * dpr
    this.canvas.height = innerHeight * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!this.to) this.from = this.defaultRect()
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.raf = requestAnimationFrame(this.frame)

    // Progress: settled tasks, plus a crawl that slows as it approaches the next step.
    this.crawl += (1 - this.crawl) * dt * 0.35
    const target = this.total ? Math.min(1, (this.done + 0.7 * this.crawl) / (this.total + 0.7)) : this.crawl * 0.5
    const full = this.to ? 1 : target
    this.shown = reducedMotion ? full : this.shown + (full - this.shown) * (1 - Math.exp(-dt * 4))
    if (this.to) this.moveT = Math.min(1, this.moveT + dt / 0.7)

    const e = this.moveT * this.moveT * (3 - 2 * this.moveT)
    const to = this.to ?? this.from
    const r = {
      x: this.from.x + (to.x - this.from.x) * e,
      y: this.from.y + (to.y - this.from.y) * e,
      size: this.from.size + (to.size - this.from.size) * e,
    }
    this.draw(r, now / 1000)
  }

  private draw(r: Rect, time: number) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    if (!this.dots.length) return
    const scanV = this.shown * 1.08 - 0.04
    const cell = r.size / GRID
    for (const d of this.dots) {
      if (d.v > scanV) continue
      // Fresh dots flare at the scan line, then settle to the photo's brightness.
      const age = scanV - d.v
      const flare = Math.exp(-age * 40)
      // The photo is cut off at the shoulders; fade the bottom rows instead of a hard edge.
      const edge = Math.min(1, (1 - d.v) / 0.18)
      const a = Math.min(1, d.lum * 1.1 + flare * 0.8) * (0.55 + 0.45 * d.depth) * edge * edge
      const size = cell * (0.28 + 0.42 * d.depth) * (1 + flare)
      const jitter = flare * Math.sin(time * 30 + d.u * 90) * cell * 0.3
      ctx.fillStyle = `rgba(${Math.round(150 + 105 * flare)}, ${Math.round(205 + 50 * flare)}, 255, ${a.toFixed(3)})`
      ctx.fillRect(r.x + d.u * r.size - size / 2 + jitter, r.y + d.v * r.size - size / 2, size, size)
    }
    if (this.shown < 0.999 && this.moveT < 0.5) {
      const y = r.y + scanV * r.size
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.size, 0)
      g.addColorStop(0, 'rgba(159, 216, 255, 0)')
      g.addColorStop(0.5, 'rgba(220, 240, 255, 0.85)')
      g.addColorStop(1, 'rgba(159, 216, 255, 0)')
      ctx.fillStyle = g
      ctx.fillRect(r.x - r.size * 0.1, y, r.size * 1.2, 1)
    }
  }
}

function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** Samples the photo and depth map onto the dot grid; background (far) pixels are dropped. */
function sample(photo: HTMLImageElement, depth: HTMLImageElement) {
  const read = (img: HTMLImageElement) => {
    const c = document.createElement('canvas')
    c.width = c.height = GRID
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0, GRID, GRID)
    return x.getImageData(0, 0, GRID, GRID).data
  }
  const p = read(photo)
  const d = read(depth)
  const dots = []
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const k = (j * GRID + i) * 4
      const z = d[k] / 255
      if (z < 0.12) continue
      const lum = (0.2126 * p[k] + 0.7152 * p[k + 1] + 0.0722 * p[k + 2]) / 255
      dots.push({ u: (i + 0.5) / GRID, v: (j + 0.5) / GRID, lum, depth: z })
    }
  }
  return dots
}
