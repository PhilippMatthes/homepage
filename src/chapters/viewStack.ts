import { Vector3 } from 'three'
import { STACK_CENTER } from '../world/layout'

/**
 * Chapter 01: right after the cover, the portrait's points rebuild into an
 * app screen drawn only with points, which then explodes into its view
 * hierarchy like Xcode's 3D view debugger. This samples a target position
 * for every particle on one of the screen's layers.
 *
 * Kinds (floor of aStack.w): 0 view bounds, 1 UI shapes, 2 text lines,
 * 3 accent (the selected view), 4 faint backdrop glass.
 */
export const STACK_KIND = { frame: 0, ui: 1, text: 2, accent: 3, glass: 4 } as const

type V2 = [number, number]
/** A 2D point on the screen (meters, origin at its center) and its kind. */
type Sample = { p: V2; kind: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** Random point on a rectangle's outline (lo..hi). */
function onRect(lo: V2, hi: V2): V2 {
  const w = hi[0] - lo[0]
  const h = hi[1] - lo[1]
  let t = Math.random() * 2 * (w + h)
  if (t < w) return [lo[0] + t, lo[1]]
  t -= w
  if (t < h) return [hi[0], lo[1] + t]
  t -= h
  if (t < w) return [hi[0] - t, hi[1]]
  t -= w
  return [lo[0], hi[1] - t]
}

/** Random point on a rounded rectangle's outline, centered at c with half size b and corner radius r. */
function onRoundRect(c: V2, b: V2, r: number): V2 {
  const sx = b[0] - r
  const sy = b[1] - r
  const straight = 4 * (sx + sy)
  const arc = 2 * Math.PI * r
  let t = Math.random() * (straight + arc)
  if (t < straight) {
    const side = Math.floor((t / straight) * 4)
    const f = Math.random() * 2 - 1
    if (side === 0) return [c[0] + f * sx, c[1] - b[1]]
    if (side === 1) return [c[0] + f * sx, c[1] + b[1]]
    if (side === 2) return [c[0] - b[0], c[1] + f * sy]
    return [c[0] + b[0], c[1] + f * sy]
  }
  t = Math.random() * Math.PI * 2
  const qx = Math.cos(t) >= 0 ? sx : -sx
  const qy = Math.sin(t) >= 0 ? sy : -sy
  return [c[0] + qx + Math.cos(t) * r, c[1] + qy + Math.sin(t) * r]
}

/** Random point on a segment. */
function onSeg(a: V2, b: V2): V2 {
  const t = Math.random()
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Random point on a circular arc around c (angles in radians). */
function onArc(c: V2, r: number, a0: number, a1: number): V2 {
  const a = rnd(a0, a1)
  return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]
}

/** Random point inside a rectangle. */
function inRect(lo: V2, hi: V2): V2 {
  return [rnd(lo[0], hi[0]), rnd(lo[1], hi[1])]
}

// ---------- the app screen ----------

/** Screen size (m) and corner radius. */
const SCREEN = { w: 2.3, h: 4.6, r: 0.32 }
/** Screen pose: turned away from the orbit camera so the exploded layers fan out sideways. */
const POSE = { yaw: -0.38, tilt: -0.08 }
/** The screen's axes in world space: across, up and its normal (the axis the layers spread along). */
const AX = new Vector3(Math.cos(POSE.yaw), 0, -Math.sin(POSE.yaw))
const AY = new Vector3(0, Math.cos(POSE.tilt), Math.sin(POSE.tilt))
const NORMAL = new Vector3().crossVectors(AX, AY).normalize()

/**
 * Exploded, the back and front layers sit this far apart (m), and fan around
 * the vertical axis by this many radians. Shared with the particle shader.
 */
export const STACK_DEPTH = 3.1
export const STACK_FAN = 0.5

/**
 * The 8 corners of the back and front layers at the given spread, placed
 * the way the particle shader places them (breathing at its widest), so the
 * camera can keep the whole stack in view.
 */
export function stackCorners(spread: number, time: number, out: Vector3[]) {
  const s = spread * 1.07
  let n = 0
  for (const l of [0, 1]) {
    const a = ((l - 0.5) * STACK_FAN + Math.sin(time * 0.45) * 0.07) * s
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = (out[n] ??= new Vector3())
        .copy(AX).multiplyScalar((u * SCREEN.w) / 2)
        .addScaledVector(AY, (v * SCREEN.h) / 2)
        .addScaledVector(NORMAL, (l - 0.5) * STACK_DEPTH * s)
      q.set(ca * q.x + sa * q.z, q.y, -sa * q.x + ca * q.z).add(STACK_CENTER)
      n++
    }
  }
  return out
}

/** Point at (u, v) ∈ [0, 1]² on the screen, v up. */
const at = (u: number, v: number): V2 => [(u - 0.5) * SCREEN.w, (v - 0.5) * SCREEN.h]
/** Half size of a box (u0, v0)–(u1, v1) in meters, and its center. */
const box = (u0: number, v0: number, u1: number, v1: number) => {
  const lo = at(u0, v0)
  const hi = at(u1, v1)
  return { lo, hi, c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] as V2, b: [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2] as V2 }
}
/** A text line from (u, v), `len` of the screen width long. */
const text = (u: number, v: number, len: number): Sample => ({ p: onSeg(at(u, v), at(u + len, v)), kind: STACK_KIND.text })

// Views, laid out once so every layer lines up with the ones below it.
const NAV = box(0.04, 0.86, 0.96, 0.975)
const TABS = box(0.04, 0.02, 0.96, 0.095)
const SCROLL = box(0.04, 0.105, 0.96, 0.85)
const HERO = box(0.07, 0.6, 0.93, 0.835)
const CARD_L = box(0.07, 0.34, 0.48, 0.585)
const CARD_R = box(0.52, 0.34, 0.93, 0.585)
const LIST = box(0.07, 0.12, 0.93, 0.325)
const CARD_R_RAD = 0.09

/** Layer 0: the window, its rounded outline and a faint glass fill. */
function windowLayer(): Sample {
  if (Math.random() < 0.55) return { p: onRoundRect([0, 0], [SCREEN.w / 2, SCREEN.h / 2], SCREEN.r), kind: STACK_KIND.frame }
  return { p: inRect(at(0.02, 0.01), at(0.98, 0.99)), kind: STACK_KIND.glass }
}

/** Layer 1: the scroll container and its scroll indicator. */
function scrollLayer(): Sample {
  if (Math.random() < 0.8) return { p: onRect(SCROLL.lo, SCROLL.hi), kind: STACK_KIND.frame }
  return { p: onSeg(at(0.975, 0.6), at(0.975, 0.8)), kind: STACK_KIND.ui }
}

/** Layer 2: navigation bar with a large title, and a tab bar with five tabs. */
function barsLayer(): Sample {
  const r = Math.random()
  if (r < 0.2) return { p: onRect(NAV.lo, NAV.hi), kind: STACK_KIND.frame }
  if (r < 0.4) return { p: onRect(TABS.lo, TABS.hi), kind: STACK_KIND.frame }
  if (r < 0.62) {
    // Large title, drawn as a thick bar of short strokes, plus the status bar.
    if (Math.random() < 0.75) return { p: inRect(at(0.08, 0.885), at(0.5, 0.91)), kind: STACK_KIND.text }
    return Math.random() < 0.5 ? text(0.08, 0.955, 0.12) : text(0.78, 0.955, 0.14)
  }
  const k = Math.floor(Math.random() * 5)
  const c = at(0.14 + k * 0.18, 0.058)
  return { p: onRoundRect(c, [0.075, 0.075], 0.03), kind: STACK_KIND.ui }
}

/** Layer 3: the cards inside the scroll view. */
function cardsLayer(): Sample {
  const cards = [HERO, HERO, CARD_L, CARD_R, LIST, LIST]
  const c = cards[Math.floor(Math.random() * cards.length)]
  return { p: onRoundRect(c.c, c.b, CARD_R_RAD), kind: STACK_KIND.frame }
}

/** Layer 4: card content, an image with a landscape, text lines and list rows. */
function contentLayer(): Sample {
  const r = Math.random()
  if (r < 0.4) {
    // Hero image: frame, mountain range and sun.
    const img = box(0.1, 0.66, 0.9, 0.82)
    const q = Math.random()
    if (q < 0.35) return { p: onRect(img.lo, img.hi), kind: STACK_KIND.frame }
    if (q < 0.8) {
      const peaks: V2[] = [at(0.1, 0.67), at(0.3, 0.76), at(0.42, 0.71), at(0.6, 0.79), at(0.78, 0.7), at(0.9, 0.74)]
      const k = Math.floor(Math.random() * (peaks.length - 1))
      return { p: onSeg(peaks[k], peaks[k + 1]), kind: STACK_KIND.ui }
    }
    return { p: onArc(at(0.76, 0.785), 0.09, 0, Math.PI * 2), kind: STACK_KIND.ui }
  }
  if (r < 0.52) return Math.random() < 0.5 ? text(0.1, 0.63, 0.5) : text(0.1, 0.615, 0.3)
  if (r < 0.66) {
    // Left card: three lines of text.
    const k = Math.floor(Math.random() * 3)
    return text(0.1, 0.54 - k * 0.04, [0.32, 0.26, 0.18][k])
  }
  // List: three rows, each an avatar, two lines and a separator.
  const row = Math.floor(Math.random() * 3)
  const v = 0.29 - row * 0.065
  const q = Math.random()
  if (q < 0.35) return { p: onArc(at(0.14, v), 0.09, 0, Math.PI * 2), kind: STACK_KIND.ui }
  if (q < 0.65) return text(0.22, v + 0.01, 0.4)
  if (q < 0.85) return text(0.22, v - 0.012, 0.25)
  return { p: onSeg(at(0.1, v - 0.032), at(0.9, v - 0.032)), kind: STACK_KIND.frame }
}

/** Layer 5: controls, a button, a slider and toggles. */
function controlsLayer(): Sample {
  const r = Math.random()
  if (r < 0.3) {
    // Call-to-action pill on the hero card.
    const b = box(0.6, 0.605, 0.9, 0.645)
    return { p: onRoundRect(b.c, b.b, b.b[1]), kind: Math.random() < 0.5 ? STACK_KIND.ui : STACK_KIND.frame }
  }
  if (r < 0.5) {
    // Slider in the left card: track and knob.
    if (Math.random() < 0.6) return { p: onSeg(at(0.1, 0.39), at(0.45, 0.39)), kind: STACK_KIND.ui }
    return { p: onArc(at(0.33, 0.39), 0.06, 0, Math.PI * 2), kind: STACK_KIND.ui }
  }
  // A toggle at the end of each list row; the first one is on.
  const row = Math.floor(Math.random() * 3)
  const v = 0.29 - row * 0.065
  if (Math.random() < 0.6) return { p: onRoundRect(at(0.83, v), [0.11, 0.06], 0.06), kind: STACK_KIND.ui }
  return { p: onArc(at(row === 0 ? 0.86 : 0.8, v), 0.045, 0, Math.PI * 2), kind: STACK_KIND.ui }
}

/**
 * Layer 6, the selected view: a sound-level gauge (a nod to Lautstärke) in
 * the right card, with the debugger's selection outline around it.
 */
function selectedLayer(): Sample {
  const c = at(0.725, 0.44)
  const rad = 0.3
  const r = Math.random()
  if (r < 0.22) return { p: onRect(CARD_R.lo, CARD_R.hi), kind: STACK_KIND.accent }
  if (r < 0.6) return { p: onArc(c, rad, -0.2, Math.PI + 0.2), kind: STACK_KIND.accent }
  if (r < 0.78) {
    // Tick marks around the arc.
    const k = Math.floor(Math.random() * 11)
    const a = Math.PI + 0.2 - k * ((Math.PI + 0.4) / 10)
    const d = rnd(rad * 0.78, rad * 0.92)
    return { p: [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d], kind: STACK_KIND.accent }
  }
  if (r < 0.92) {
    // Needle, pointing into the loud part of the scale.
    const a = 0.75
    return { p: onSeg(c, [c[0] + Math.cos(a) * rad * 0.85, c[1] + Math.sin(a) * rad * 0.85]), kind: STACK_KIND.accent }
  }
  return text(0.62, 0.37, 0.2)
}

/**
 * Layers back to front, with each layer's share of the points. The view
 * debugger shows every view's bounds, so most layers lean on outlines.
 */
const LAYERS: Array<[number, () => Sample]> = [
  [0.14, windowLayer],
  [0.07, scrollLayer],
  [0.15, barsLayer],
  [0.13, cardsLayer],
  [0.25, contentLayer],
  [0.14, controlsLayer],
  [0.12, selectedLayer],
]

/**
 * Per particle: target = (world position on the flat screen, kind +
 * brightness / 2), layer = depth slot 0 (back) … 1 (front), used by the
 * shader to spread the layers along `normal` and colour-code them.
 */
export function viewStackTargets(count: number) {
  const target = new Float32Array(count * 4)
  const layer = new Float32Array(count)
  const [ax, ay, normal] = [AX, AY, NORMAL]
  const o = new Vector3()

  const total = LAYERS.reduce((s, [w]) => s + w, 0)
  const last = LAYERS.length - 1
  for (let i = 0; i < count; i++) {
    let t = Math.random() * total
    let k = 0
    while (k < last && t > LAYERS[k][0]) t -= LAYERS[k++][0]
    const s = LAYERS[k][1]()
    const l = k / last
    // Flat, the layers still sit a hair apart, so they never z-fight.
    o.copy(STACK_CENTER).addScaledVector(ax, s.p[0]).addScaledVector(ay, s.p[1]).addScaledVector(normal, (l - 0.5) * 0.04)
    const j = s.kind === STACK_KIND.glass ? 0.01 : 0.004
    target[i * 4] = o.x + (Math.random() - 0.5) * j
    target[i * 4 + 1] = o.y + (Math.random() - 0.5) * j
    target[i * 4 + 2] = o.z + (Math.random() - 0.5) * j
    // Brightness 0.6..0.98, halved so it stays a fraction next to the kind.
    target[i * 4 + 3] = s.kind + rnd(0.6, 0.98) / 2
    layer[i] = l
  }
  return { target, layer, normal: NORMAL.clone() }
}
