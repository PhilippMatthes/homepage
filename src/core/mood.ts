import { applyTheme, palette } from './palette'
import { range, smooth } from './timeline'

/** The current section's accent (read-only outside palette.ts). */
export const moodAccent: Readonly<typeof palette.accent> = palette.accent

/** Blends the section palettes for `p` (palette.bg is shared by the materials) and returns the clear color. */
export function applyMood(p: number, root: HTMLElement) {
  return applyTheme(p, root)
}

/**
 * Bloom per chapter: dense scenes (the hall full of LEDs, the dashboards) get
 * less glow so they don't wash out; sparse ones (portrait, city, globe) get more.
 * `threshold` is the luminance where glow starts.
 */
const BLOOM: Array<{ p: number; intensity: number; threshold: number }> = [
  { p: 0.0, intensity: 0.8, threshold: 0.5 }, // cover portrait (full-colour photo: bloom only the highlights)
  { p: 0.1, intensity: 1.0, threshold: 0.22 }, // 3D & shaders
  { p: 0.2, intensity: 0.8, threshold: 0.27 }, // datacenter hall
  { p: 0.45, intensity: 0.9, threshold: 0.25 }, // rack, server, agents
  { p: 0.62, intensity: 0.85, threshold: 0.26 }, // Perses dashboards
  { p: 0.76, intensity: 1.0, threshold: 0.22 }, // point cloud
  { p: 0.88, intensity: 1.1, threshold: 0.2 }, // city
  { p: 0.975, intensity: 1.3, threshold: 0.18 }, // globe
  { p: 1.0, intensity: 1.3, threshold: 0.18 },
]
const bloomOut = { intensity: 1, threshold: 0.22 }

export function bloomAt(p: number) {
  let i = 0
  while (i < BLOOM.length - 2 && p > BLOOM[i + 1].p) i++
  const t = smooth(range(p, BLOOM[i].p, BLOOM[i + 1].p))
  bloomOut.intensity = BLOOM[i].intensity + (BLOOM[i + 1].intensity - BLOOM[i].intensity) * t
  bloomOut.threshold = BLOOM[i].threshold + (BLOOM[i + 1].threshold - BLOOM[i].threshold) * t
  return bloomOut
}
