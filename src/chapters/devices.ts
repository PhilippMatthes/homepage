import { Vector3 } from 'three'
import { DEVICES } from '../world/layout'

/**
 * Chapter 01: right after the cover, the portrait's points rebuild into a
 * MacBook and an iPhone drawn only with points. This samples a target
 * position for every particle on the devices' outlines and screen UI.
 *
 * Kinds (floor of aDevice.w): 0 outline, 1 screen UI, 2 keys and trackpad,
 * 3 accent (amber app icon), 4 faint screen glass.
 */
export const DEVICE_KIND = { outline: 0, ui: 1, keys: 2, accent: 3, glass: 4 } as const

type V2 = [number, number]
/** A 2D point on a part, in that part's local frame, plus its kind. */
type Sample = { p: V2; kind: number; layer?: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]

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

/** Random point inside a rectangle. */
function inRect(lo: V2, hi: V2): V2 {
  return [rnd(lo[0], hi[0]), rnd(lo[1], hi[1])]
}

// ---------- MacBook ----------

const MAC = { w: 3.6, d: 2.4, h: 0.1, lidT: 0.05, open: (105 * Math.PI) / 180 }
const LID_H = MAC.d - 0.05
/** Display area on the lid, in lid coordinates (x across, v up from the hinge, meters). */
const SCREEN = { lo: [-MAC.w / 2 + 0.1, 0.1] as V2, hi: [MAC.w / 2 - 0.1, LID_H - 0.1] as V2 }

/** The display's UI: menu bar, two windows (one with a wireframe cube), a dock. */
function macScreen(): Sample {
  const [x0, y0] = SCREEN.lo
  const [x1, y1] = SCREEN.hi
  const W = x1 - x0
  const H = y1 - y0
  const at = (u: number, v: number): V2 => [x0 + u * W, y0 + v * H]
  const r = Math.random()
  if (r < 0.1) return { p: inRect(at(0, 0.955), at(1, 0.975)), kind: DEVICE_KIND.ui } // menu bar
  if (r < 0.22) {
    // Dock: a pill with 8 icons.
    if (Math.random() < 0.35) return { p: onRoundRect(at(0.5, 0.075), [W * 0.24, H * 0.055], H * 0.03), kind: DEVICE_KIND.ui }
    const k = Math.floor(Math.random() * 8)
    const c = at(0.5 + (k - 3.5) * 0.055, 0.075)
    return { p: onRoundRect(c, [H * 0.032, H * 0.032], H * 0.012), kind: k === 5 ? DEVICE_KIND.accent : DEVICE_KIND.ui }
  }
  if (r < 0.55) {
    // Back window: title bar, a sidebar and text lines.
    const lo = at(0.06, 0.28)
    const hi = at(0.58, 0.86)
    const q = Math.random()
    if (q < 0.4) return { p: onRect(lo, hi), kind: DEVICE_KIND.ui }
    if (q < 0.55) return { p: inRect([lo[0], hi[1] - H * 0.05], hi), kind: DEVICE_KIND.ui }
    if (q < 0.65) return { p: onSeg([lo[0] + W * 0.13, lo[1]], [lo[0] + W * 0.13, hi[1] - H * 0.05]), kind: DEVICE_KIND.ui }
    const line = Math.floor(Math.random() * 7)
    const ly = hi[1] - H * (0.12 + line * 0.06)
    const len = W * (0.18 + ((line * 37) % 10) * 0.012)
    return { p: onSeg([lo[0] + W * 0.16, ly], [lo[0] + W * 0.16 + len, ly]), kind: DEVICE_KIND.ui }
  }
  if (r < 0.92) {
    // Front window: a 3D viewport with a rotating-looking wireframe cube.
    const lo = at(0.42, 0.18)
    const hi = at(0.94, 0.74)
    const q = Math.random()
    if (q < 0.3) return { p: onRect(lo, hi), kind: DEVICE_KIND.ui }
    if (q < 0.42) return { p: inRect([lo[0], hi[1] - H * 0.05], hi), kind: DEVICE_KIND.ui }
    const c: V2 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1] - H * 0.05) / 2]
    const s = H * 0.16
    // Isometric cube corners.
    const P = (x: number, y: number, z: number): V2 => [c[0] + (x - z) * s * 0.87, c[1] + (y + (x + z) * 0.5) * s * 0.9]
    const v = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)]
    const edges: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
    const [a, b] = pick(edges)
    return { p: onSeg(v[a], v[b]), kind: DEVICE_KIND.ui }
  }
  return { p: inRect(SCREEN.lo, SCREEN.hi), kind: DEVICE_KIND.glass }
}

/** Lid outline (front and back face), x across, v up from the hinge, layer 0 front / 1 back. */
function lidOutline(): Sample {
  const q = Math.random()
  if (q < 0.75) return { p: onRect([-MAC.w / 2, 0], [MAC.w / 2, LID_H]), kind: DEVICE_KIND.outline, layer: Math.random() < 0.6 ? 0 : 1 }
  return { p: onRect(SCREEN.lo, SCREEN.hi), kind: DEVICE_KIND.outline, layer: 0 }
}

/** Deck (top of the base): x across, y towards the viewer from the hinge (0..d). */
function deck(): Sample {
  const w = MAC.w
  if (Math.random() < 0.18) return { p: onRect([-w * 0.15, MAC.d * 0.64], [w * 0.15, MAC.d * 0.94]), kind: DEVICE_KIND.keys }
  const cols = 14
  const rows = 6
  const lo: V2 = [-w * 0.43, MAC.d * 0.08]
  const hi: V2 = [w * 0.43, MAC.d * 0.56]
  const cw = (hi[0] - lo[0]) / cols
  const ch = (hi[1] - lo[1]) / rows
  const row = Math.floor(Math.random() * rows)
  // The space bar spans five keys on the front row.
  if (row === rows - 1 && Math.random() < 0.35) {
    return { p: onRect([-cw * 2.5 + cw * 0.08, lo[1] + row * ch + ch * 0.08], [cw * 2.5 - cw * 0.08, lo[1] + (row + 1) * ch - ch * 0.08]), kind: DEVICE_KIND.keys }
  }
  const col = Math.floor(Math.random() * cols)
  const kx = lo[0] + col * cw
  const ky = lo[1] + row * ch
  return { p: onRect([kx + cw * 0.1, ky + ch * 0.1], [kx + cw * 0.9, ky + ch * 0.9]), kind: DEVICE_KIND.keys }
}

/** Base box edges in base-local 3D (x across, y up from the bottom, z towards the viewer). */
function baseEdge(out: Vector3) {
  const hw = MAC.w / 2
  const hd = MAC.d / 2
  const corners = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-hw, MAC.h, -hd], [hw, MAC.h, -hd], [hw, MAC.h, hd], [-hw, MAC.h, hd],
  ]
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  // Long edges are sampled in proportion to their length.
  const lens = edges.map(([a, b]) => Math.hypot(...corners[a].map((v, i) => corners[b][i] - v)))
  let t = Math.random() * lens.reduce((s, l) => s + l, 0)
  let k = 0
  while (t > lens[k]) t -= lens[k++]
  const [a, b] = edges[k]
  const f = t / lens[k]
  return out.set(...(corners[a].map((v, i) => v + (corners[b][i] - v) * f) as [number, number, number]))
}

// ---------- iPhone ----------

const PHONE = { w: 0.82, h: 1.7, t: 0.07, r: 0.13, yaw: 0.45, tilt: -0.1 }

/** Phone face in local 2D (x across, y up from the center), layer 0 front / 1 back. */
function phone(): Sample {
  const hw = PHONE.w / 2
  const hh = PHONE.h / 2
  const r = Math.random()
  if (r < 0.28) return { p: onRoundRect([0, 0], [hw, hh], PHONE.r), kind: DEVICE_KIND.outline, layer: Math.random() < 0.65 ? 0 : 1 }
  if (r < 0.34) {
    // Dynamic Island and status bar.
    if (Math.random() < 0.6) return { p: onRoundRect([0, hh - 0.11], [0.13, 0.035], 0.035), kind: DEVICE_KIND.ui }
    return { p: inRect([hw - 0.27, hh - 0.125], [hw - 0.12, hh - 0.1]), kind: DEVICE_KIND.ui }
  }
  if (r < 0.95) {
    // Home screen: 4 x 6 app icons plus a dock row of 4.
    const dock = Math.random() < 0.16
    const col = Math.floor(Math.random() * 4)
    const row = dock ? 0 : Math.floor(Math.random() * 6)
    const pitch = (PHONE.w - 0.2) / 4
    const cx = -hw + 0.1 + pitch * (col + 0.5)
    const cy = dock ? -hh + 0.17 : hh - 0.33 - row * pitch * 1.12
    const s = pitch * 0.34
    const accent = !dock && row === 1 && col === 2
    // Most icons are outlines; some get a glyph in the middle.
    const q = Math.random()
    const p = q < 0.8 ? onRoundRect([cx, cy], [s, s], s * 0.42) : onRoundRect([cx, cy], [s * 0.4, s * 0.4], s * 0.4)
    if (dock && Math.random() < 0.3) return { p: onRoundRect([0, -hh + 0.17], [hw - 0.06, pitch * 0.5], pitch * 0.3), kind: DEVICE_KIND.ui }
    return { p, kind: accent ? DEVICE_KIND.accent : DEVICE_KIND.ui }
  }
  return { p: inRect([-hw + 0.05, -hh + 0.05], [hw - 0.05, hh - 0.05]), kind: DEVICE_KIND.glass }
}

/**
 * Per particle: aDevice = (world position on the devices, kind + brightness / 2).
 */
export function deviceTargets(count: number) {
  const target = new Float32Array(count * 4)
  const o = new Vector3()

  // MacBook frame: base centered under the composition, lid hinged at the back.
  const base = new Vector3(DEVICES.x - 0.45, DEVICES.y - 1.15, DEVICES.z - 0.2)
  const hinge = new Vector3(base.x, base.y + MAC.h, base.z - MAC.d / 2)
  const lidUp = new Vector3(0, Math.sin(MAC.open), Math.cos(MAC.open))
  const lidN = new Vector3(0, -Math.cos(MAC.open), Math.sin(MAC.open))
  // iPhone frame: standing to the right of the MacBook, turned towards the orbit camera.
  const phoneC = new Vector3(DEVICES.x + 2.05, base.y + PHONE.h / 2 + 0.02, DEVICES.z + 0.55)
  const cy = Math.cos(PHONE.yaw)
  const sy = Math.sin(PHONE.yaw)
  const phoneX = new Vector3(cy, 0, -sy)
  const phoneY = new Vector3(0, Math.cos(PHONE.tilt), Math.sin(PHONE.tilt))
  const phoneN = new Vector3().crossVectors(phoneX, phoneY).normalize()

  const parts: Array<[number, () => number]> = [
    // MacBook display UI.
    [0.27, () => {
      const s = macScreen()
      o.copy(hinge).addScaledVector(lidUp, s.p[1]).addScaledVector(lidN, 0.02)
      o.x += s.p[0]
      return s.kind
    }],
    // Lid outline.
    [0.1, () => {
      const s = lidOutline()
      o.copy(hinge).addScaledVector(lidUp, s.p[1]).addScaledVector(lidN, s.layer ? -MAC.lidT : 0.01)
      o.x += s.p[0]
      return s.kind
    }],
    // Keyboard and trackpad.
    [0.15, () => {
      const s = deck()
      o.set(base.x + s.p[0], base.y + MAC.h + 0.005, hinge.z + s.p[1])
      return s.kind
    }],
    // Base outline.
    [0.12, () => {
      baseEdge(o)
      o.add(base)
      return DEVICE_KIND.outline
    }],
    // iPhone.
    [0.26, () => {
      const s = phone()
      const off = s.layer ? -PHONE.t : 0.01
      o.copy(phoneC).addScaledVector(phoneX, s.p[0]).addScaledVector(phoneY, s.p[1]).addScaledVector(phoneN, off)
      return s.kind
    }],
  ]
  const total = parts.reduce((s, [w]) => s + w, 0)

  for (let i = 0; i < count; i++) {
    let t = Math.random() * total
    let k = 0
    while (t > parts[k][0]) t -= parts[k++][0]
    const kind = parts[k][1]()
    const j = kind === DEVICE_KIND.glass ? 0.01 : 0.004
    target[i * 4] = o.x + (Math.random() - 0.5) * j
    target[i * 4 + 1] = o.y + (Math.random() - 0.5) * j
    target[i * 4 + 2] = o.z + (Math.random() - 0.5) * j
    // Brightness 0.6..0.98, halved so it stays a fraction next to the kind.
    target[i * 4 + 3] = kind + rnd(0.6, 0.98) / 2
  }
  return { target }
}
