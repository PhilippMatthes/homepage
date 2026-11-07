import { Color } from 'three'
import { palette } from './palette'
import { range, smooth } from './timeline'

/**
 * Very subtle per-chapter color moods: the background drifts between
 * near-black navy, violet, teal and green tints, and the UI accent follows.
 */
// Note: the clear color ends up ~3x brighter on screen than these hex values,
// so deltas are kept tiny on purpose.
const KEYS: Array<{ p: number; bg: string; accent: string }> = [
  { p: 0.0, bg: '#02040a', accent: '#3fa9ff' }, // cover
  { p: 0.1, bg: '#03030c', accent: '#8f9dff' }, // 3D & shaders
  { p: 0.27, bg: '#02050b', accent: '#3fc4ff' }, // datacenter network
  { p: 0.45, bg: '#02040a', accent: '#3fa9ff' }, // rack, server
  { p: 0.64, bg: '#03030c', accent: '#8a94ff' }, // Perses
  { p: 0.77, bg: '#02050b', accent: '#38d0ff' }, // machine learning
  { p: 0.89, bg: '#02060a', accent: '#4fe0a0' }, // PrioBike
  { p: 0.915, bg: '#02060a', accent: '#4fe0a0' }, // hold the green through the zoom-out
  { p: 0.975, bg: '#02040a', accent: '#5fb4ff' }, // globe
  { p: 1.0, bg: '#02040a', accent: '#5fb4ff' },
].map((k) => ({ ...k }))

const bgs = KEYS.map((k) => new Color(k.bg))
const accents = KEYS.map((k) => new Color(k.accent))
const accent = new Color()
/** The current chapter accent (read-only outside this module). */
export const moodAccent: Readonly<Color> = accent
let lastCss = ''

/** Updates palette.bg in place (shared by the materials) and the CSS accent. */
export function applyMood(p: number, root: HTMLElement) {
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
  const t = smooth(range(p, KEYS[i].p, KEYS[i + 1].p))
  palette.bg.copy(bgs[i]).lerp(bgs[i + 1], t)
  accent.copy(accents[i]).lerp(accents[i + 1], t)
  const css = `#${accent.getHexString()}`
  if (css !== lastCss) {
    lastCss = css
    root.style.setProperty('--accent', css)
    root.style.setProperty('--bg', `#${palette.bg.getHexString()}`)
  }
  return palette.bg
}

/**
 * Bloom per chapter: dense scenes (the hall full of LEDs, the dashboards) get
 * less glow so they don't wash out; sparse ones (portrait, city, globe) get more.
 * `threshold` is the luminance where glow starts.
 */
const BLOOM: Array<{ p: number; intensity: number; threshold: number }> = [
  { p: 0.0, intensity: 1.15, threshold: 0.22 }, // cover portrait
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
