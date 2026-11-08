import { PerspectiveCamera, Vector3 } from 'three'
import { range, smooth, lerp } from './timeline'
import type { Pointer } from './pointer'
import { GLOBE_CENTER, GLOBE_RADIUS, PORTRAIT_CENTER } from '../world/layout'

/** Visible bust (hair to the shoulder fade), in meters relative to PORTRAIT_CENTER.y. */
const BUST = { top: 1.9, bottom: -1.9 }
import { shared } from './shared'

interface Key {
  p: number
  pos: [number, number, number]
  target: [number, number, number]
  fov: number
  /**
   * Landscape only: slide the camera sideways by this many meters so the
   * subject sits right (positive) or left (negative) of the chapter copy.
   * Portrait screens keep the subject centered and put the copy below.
   */
  shift?: number
  /**
   * Portrait screens only: extra zoom on top of keeping the horizontal field
   * of view, for subjects that would otherwise look small on a narrow phone.
   */
  zoom?: number
  /**
   * Bottom-sheet screens only: a different eye position. Without the sideways
   * shift, a wide orbit turns the subject edge-on, so these keys orbit less.
   */
  sheetPos?: [number, number, number]
}

/**
 * One continuous camera path through the whole page. Positions and targets
 * are Catmull-Rom splines through the keys; timing slows down near keys
 * (Apple-style "settle" moments) without ever fully stopping.
 */
const G = GLOBE_CENTER
const R = GLOBE_RADIUS
const orbit = (deg: number, r: number, y: number): [number, number, number] => [
  Math.sin((deg * Math.PI) / 180) * r,
  y,
  Math.cos((deg * Math.PI) / 180) * r,
]
const KEYS: Key[] = [
  // cover: the 3D photo
  { p: 0.0, pos: [0, 29.1, 10.6], target: [0, 29.1, 0], fov: 44, zoom: 1.45 },
  { p: 0.035, pos: [0, 29.2, 10.0], target: [0, 29.2, 0], fov: 42, zoom: 1.4 },
  // it burns into points that rebuild into an app screen, nearly face-on; as its
  // view hierarchy explodes we orbit round to the side, like the 3D view debugger
  { p: 0.065, pos: orbit(-6, 9.8, 30.4), sheetPos: orbit(-4, 10.4, 30.4), target: [0.4, 29.6, 0.2], fov: 40, shift: 1.3, zoom: 1.1 },
  { p: 0.095, pos: orbit(22, 10.2, 31.0), sheetPos: orbit(14, 10.8, 30.9), target: [0.3, 29.35, 0.2], fov: 40, shift: 1.9, zoom: 1.1 },
  { p: 0.125, pos: orbit(34, 10.2, 31.3), sheetPos: orbit(22, 10.8, 31.2), target: [0.3, 29.35, 0.2], fov: 40, shift: 1.9, zoom: 1.1 },
  // the points rain down onto the datacenter
  { p: 0.165, pos: [4, 34, 14], target: [0, 16, 0], fov: 42 },
  { p: 0.21, pos: [0, 42, 30], target: [0, 0, 0], fov: 45 },
  // pull out: a network of datacenters
  { p: 0.255, pos: [0, 92, 108], target: [0, 0, -4], fov: 45, shift: -24 },
  { p: 0.295, pos: [4, 84, 98], target: [0, 0, -4], fov: 45, shift: -22 },
  // dive through the vanishing roof into the aisle
  { p: 0.33, pos: [0, 24, 12], target: [0, 0, 1.5], fov: 45 },
  { p: 0.36, pos: [2.5, 12, 9.5], target: [1, 0.5, 5.5], fov: 45 },
  // drop in beyond the end of the rows, then glide down the aisle
  { p: 0.39, pos: [8.2, 3.2, 6.4], target: [2.5, 1.2, 6.2], fov: 44 },
  { p: 0.415, pos: [3.2, 1.35, 6.5], target: [0.4, 1.05, 5.6], fov: 42 },
  { p: 0.435, pos: [0, 1.12, 6.9], target: [0, 1.0, 5.3], fov: 40 },
  // server slides out, top-down onto the board
  { p: 0.47, pos: [0, 1.7, 6.75], target: [0, 0.98, 5.6], fov: 40 },
  { p: 0.505, pos: [0, 1.62, 5.8], target: [0, 0.985, 5.52], fov: 40, shift: -0.17 },
  { p: 0.555, pos: [0.06, 1.5, 5.74], target: [0.03, 0.985, 5.5], fov: 40, shift: -0.15 },
  { p: 0.58, pos: [0.04, 2.0, 6.6], target: [0.02, 1.4, 5.7], fov: 42 },
  // back up to the Perses dashboards floating above the aisle
  { p: 0.615, pos: [0, 3.8, 11.4], target: [0, 3.3, 6.25], fov: 45, shift: 1.65 },
  { p: 0.675, pos: [0.4, 3.75, 11.1], target: [0, 3.3, 6.25], fov: 45, shift: 1.55 },
  // up and back to the point cloud hologram
  { p: 0.735, pos: [-1.5, 8.2, 16.8], target: [0, 2.5, 5.6], fov: 45, shift: -3.4 },
  { p: 0.805, pos: [1.5, 7.6, 15.8], target: [0, 2.5, 5.6], fov: 45, shift: -3.4 },
  // zoom out over the city
  { p: 0.835, pos: [-2, 45, 60], target: [0, 0, 8], fov: 45, shift: 6 },
  { p: 0.865, pos: [2, 200, 150], target: [0, 0, 4], fov: 45, shift: 64 },
  { p: 0.92, pos: [6, 185, 132], target: [0, 0, 2], fov: 45, shift: 58 },
  // all the way out to the globe
  { p: 0.95, pos: [0, 700, 620], target: [0, -40, 6], fov: 45 },
  { p: 0.975, pos: [G.x - 0.2 * R, G.y + 3.3 * R, G.z + 1.9 * R], target: [G.x, G.y + 0.45 * R, G.z + 0.3 * R], fov: 42 },
  { p: 1.0, pos: [G.x + 0.3 * R, G.y + 3.25 * R, G.z + 2.0 * R], target: [G.x, G.y + 0.45 * R, G.z + 0.3 * R], fov: 42 },
]

const v = (a: [number, number, number]) => new Vector3(...a)
const POS = KEYS.map((k) => v(k.pos))
const SHEET_POS = KEYS.map((k) => v(k.sheetPos ?? k.pos))
const TGT = KEYS.map((k) => v(k.target))

function catmull(pts: Vector3[], i: number, t: number, out: Vector3) {
  const p0 = pts[Math.max(0, i - 1)]
  const p1 = pts[i]
  const p2 = pts[Math.min(pts.length - 1, i + 1)]
  const p3 = pts[Math.min(pts.length - 1, i + 2)]
  const t2 = t * t
  const t3 = t2 * t
  for (const c of ['x', 'y', 'z'] as const) {
    out[c] =
      0.5 *
      (2 * p1[c] +
        (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
        (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)
  }
  return out
}

export class CameraRig {
  private pos = new Vector3()
  private target = new Vector3()
  private wantPos = new Vector3()
  private wantTarget = new Vector3()
  private right = new Vector3()
  private up = new Vector3()
  private fwd = new Vector3()
  private initialized = false
  private lift = -1
  private slide = 0
  private viewW = 0
  private viewH = 0
  baseFov = 40
  private zoom = 1
  /**
   * True while the chapter copy is laid out as a bottom sheet (portrait and
   * narrow screens, see style.css). The subject is then lifted above the
   * sheet instead of being shifted sideways.
   */
  sheet = false
  /**
   * Bottom-sheet screens: the free band between the top bar and the cover
   * headline, as fractions of the viewport height. The bust is fitted into it.
   */
  heroBand = { top: 0.06, bottom: 0.8 }
  /**
   * Bottom-sheet screens: a subject (world points) to fit into the band
   * between the top bar and the copy, blended in by `weight`. main.ts fills
   * this each frame while a chapter wants it.
   */
  fit = { points: [] as Vector3[], top: 0.06, bottom: 0.6, weight: 0 }
  private v = new Vector3()
  private base = new Vector3()

  constructor(private camera: PerspectiveCamera) {}

  /** Evaluate the path at progress p (no damping). */
  sample(p: number, pos: Vector3, target: Vector3): [number, number, number] {
    let i = 0
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
    const a = KEYS[i]
    const b = KEYS[i + 1]
    const lt = range(p, a.p, b.p)
    const t = lerp(lt, smooth(lt), 0.65)
    catmull(this.sheet ? SHEET_POS : POS, i, t, pos)
    catmull(TGT, i, t, target)
    return [lerp(a.fov, b.fov, t), lerp(a.shift ?? 0, b.shift ?? 0, t), lerp(a.zoom ?? 1, b.zoom ?? 1, t)]
  }

  /**
   * `copy` (0..1) is how much copy that sits below the subject is on screen
   * (bottom sheets, the outro); the subject is lifted above it.
   */
  update(p: number, dt: number, pointer: Pointer, time: number, copy = 0) {
    const [baseFov, shift, zoom] = this.sample(p, this.wantPos, this.wantTarget)
    this.baseFov = baseFov
    this.zoom = zoom

    // Pointer parallax: strong on the hero, subtle elsewhere, scaled by distance.
    const dist = this.wantPos.distanceTo(this.wantTarget)
    const hero = 1 - smooth(range(p, 0.03, 0.06))
    const amp = dist * lerp(0.02, 0.13, hero) * pointer.presence
    this.fwd.subVectors(this.wantTarget, this.wantPos).normalize()
    this.right.crossVectors(this.fwd, this.camera.up).normalize()
    this.up.crossVectors(this.right, this.fwd).normalize()
    // Unperturbed eye, so the cover framing ignores parallax and drift.
    this.base.copy(this.wantPos)
    if (!this.sheet && this.camera.aspect >= 1 && shift !== 0) {
      this.wantPos.addScaledVector(this.right, -shift)
      this.wantTarget.addScaledVector(this.right, -shift)
    }
    this.wantPos.addScaledVector(this.right, pointer.x * amp)
    this.wantPos.addScaledVector(this.up, pointer.y * amp * 0.7)
    // A slow idle drift so the scene never feels frozen.
    const breathe = dist * 0.006
    this.wantPos.addScaledVector(this.right, Math.sin(time * 0.31) * breathe)
    this.wantPos.addScaledVector(this.up, Math.sin(time * 0.23 + 1) * breathe)

    if (!this.initialized) {
      this.pos.copy(this.wantPos)
      this.target.copy(this.wantTarget)
      this.initialized = true
    }
    const k = 1 - Math.exp(-dt * 7)
    this.pos.lerp(this.wantPos, k)
    this.target.lerp(this.wantTarget, k)

    this.camera.position.copy(this.pos)
    this.camera.lookAt(this.target)

    // Keep the horizontal field of view on portrait screens.
    const aspect = this.camera.aspect
    const frame = copy
    let fov = this.baseFov
    if (aspect < 1 || frame > 0) {
      // Zoom out a touch while the bottom sheet covers part of the screen.
      const zoom = aspect < 1 ? this.zoom : 1
      // Portrait: mostly lift (copy is a bottom sheet). Landscape: little room
      // above the subject, so mostly zoom out instead.
      const out = aspect < 1 ? 0.12 : 0.3
      const t = (Math.tan((fov * Math.PI) / 360) / Math.min(1, Math.max(aspect, 0.4))) * ((1 + out * frame) / zoom)
      fov = Math.min(80, (Math.atan(t) * 360) / Math.PI)
    }
    // Bottom sheet: move the image up so the subject sits above the copy.
    let lift = (aspect < 1 ? 0.21 : 0.09) * frame
    if (this.sheet && hero > 0) {
      const f = this.frameBust(fov)
      fov = lerp(fov, f.fov, hero)
      lift += f.lift * hero
    }
    let slide = 0
    if (this.sheet && this.fit.weight > 0 && this.fit.points.length) {
      const f = this.frameFit(aspect)
      fov = lerp(fov, f.fov, this.fit.weight)
      lift = lerp(lift, f.lift, this.fit.weight)
      slide = f.slide * this.fit.weight
    }
    this.setLift(lift, slide)
    // Depth range and fog follow the zoom level (from a 1U server to a planet).
    const d = this.pos.distanceTo(this.target)
    shared.uFogDensity.value = 0.35 / Math.max(d, 6)
    const near = Math.max(0.004, d * 0.0015)
    const far = Math.max(120, d * 4)
    const changed = Math.abs(fov - this.camera.fov) > 1e-3
    if (changed || Math.abs(near - this.camera.near) > 1e-4 || Math.abs(far - this.camera.far) > 1e-2) {
      this.camera.fov = fov
      this.camera.near = near
      this.camera.far = far
      this.camera.updateProjectionMatrix()
    }
    return changed
  }

  /**
   * Fits the bust (head to the shoulder fade) into `heroBand`: zooms so it
   * fills most of the band, then lifts (or drops) the image to center it there.
   */
  private frameBust(fov: number) {
    const { top, bottom } = this.heroBand
    const band = Math.max(0.2, bottom - top)
    // Where the eye sits relative to the portrait plane, along the camera's up axis.
    const dist = Math.max(1, this.base.z - PORTRAIT_CENTER.z)
    const eyeY = this.base.y
    const tan0 = Math.tan((fov * Math.PI) / 360)
    // Bust height on screen (fraction of the viewport) at the current fov.
    const h0 = (BUST.top - BUST.bottom) / (2 * dist * tan0)
    // Fill ~62% of the band, but never zoom far from the tuned framing.
    const z = Math.min(1.3, Math.max(0.85, (band * 0.62) / h0))
    const tan = tan0 / z
    const ndcMid = (PORTRAIT_CENTER.y + (BUST.top + BUST.bottom) / 2 - eyeY) / (dist * tan)
    const screenMid = (1 - ndcMid) / 2
    // Optical center: a touch above the geometric middle of the band.
    const want = top + band * 0.47
    return { fov: (Math.atan(tan) * 360) / Math.PI, lift: screenMid - want }
  }

  /**
   * Fits `fit.points` into the band between `fit.top` and `fit.bottom`: picks
   * the fov at which they fill most of it (or most of the width, if that's
   * tighter), then lifts and slides the image to center them in it.
   */
  private frameFit(aspect: number) {
    const { points, top, bottom } = this.fit
    const band = Math.max(0.2, bottom - top)
    this.camera.updateMatrixWorld()
    // Per point: its offset from the view axis per meter of depth (tangent space).
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of points) {
      const c = this.v.copy(p).applyMatrix4(this.camera.matrixWorldInverse)
      const d = Math.max(0.1, -c.z)
      x0 = Math.min(x0, c.x / d)
      x1 = Math.max(x1, c.x / d)
      y0 = Math.min(y0, c.y / d)
      y1 = Math.max(y1, c.y / d)
    }
    // Fill 86% of the band's height, but leave a margin left and right.
    const tanH = (y1 - y0) / (2 * band * 0.86)
    const tanW = (x1 - x0) / (2 * 0.84 * aspect)
    const tan = Math.max(tanH, tanW, 0.05)
    const screenMid = (1 - (y0 + y1) / 2 / tan) / 2
    // The subject's horizontal center, as a fraction of the viewport width from the middle.
    const slide = (x0 + x1) / 2 / (tan * aspect) / 2
    return { fov: (Math.atan(tan) * 360) / Math.PI, lift: screenMid - (top + band * 0.5), slide }
  }

  /**
   * Shifts the rendered image up by `lift` × viewport height and left by
   * `slide` × viewport width (an off-center projection).
   */
  private setLift(lift: number, slide = 0) {
    const w = innerWidth
    const h = innerHeight
    if (Math.abs(lift - this.lift) < 1e-4 && Math.abs(slide - this.slide) < 1e-4 && w === this.viewW && h === this.viewH) return
    this.lift = lift
    this.slide = slide
    this.viewW = w
    this.viewH = h
    if (Math.abs(lift) < 1e-4 && Math.abs(slide) < 1e-4) this.camera.clearViewOffset()
    else this.camera.setViewOffset(w, h, slide * w, lift * h, w, h)
  }
}
