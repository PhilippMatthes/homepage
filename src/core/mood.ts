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
