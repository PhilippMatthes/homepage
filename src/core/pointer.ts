import { reducedMotion } from './quality'

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/** Degrees of tilt that move the pointer from the center to the edge. */
const TILT_RANGE = 22

/**
 * Normalized pointer in [-1, 1]² (y up), smoothed with critically damped
 * easing so everything that follows it glides instead of jittering.
 *
 * On phones, tilting the device steers it too (gyro), so the cover's
 * parallax and light work without touching the screen.
 */
export class Pointer {
  /** Raw target. */
  readonly target = { x: 0, y: 0 }
  /** Smoothed value. */
  x = 0
  y = 0
  /** 0..1: how "present" the pointer is (fades out when idle / left window). Includes tilt. */
  presence = 0
  /** 0..1: presence of an actual mouse or finger only (for effects that "touch" things). */
  contact = 0
  private lastMove = 0
  private hasHover = matchMedia('(hover: hover)').matches
  private tilt = { x: 0, y: 0, on: false }
  /** Slowly adapting rest pose, so any natural way of holding the phone is "center". */
  private rest: { beta: number; gamma: number } | null = null

  constructor() {
    if (reducedMotion) return
    window.addEventListener('pointermove', (e) => this.set(e.clientX, e.clientY), { passive: true })
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      if (t) this.set(t.clientX, t.clientY)
    }, { passive: true })
    document.addEventListener('pointerleave', () => (this.lastMove = 0))
    if (!this.hasHover && 'DeviceOrientationEvent' in window) this.listenTilt()
  }

  private set(cx: number, cy: number) {
    this.target.x = (cx / innerWidth) * 2 - 1
    this.target.y = -((cy / innerHeight) * 2 - 1)
    this.lastMove = performance.now()
  }

  private listenTilt() {
    const start = () => window.addEventListener('deviceorientation', (e) => this.onTilt(e), { passive: true })
    const Ctor = DeviceOrientationEvent as OrientationCtor
    if (typeof Ctor.requestPermission !== 'function') return start()
    // iOS asks for permission, and only from a user gesture: the first plain tap
    // on the page (not on a link or button, which have their own job).
    const ask = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('a, button')) return
      window.removeEventListener('touchend', ask)
      Ctor.requestPermission!().then((r) => r === 'granted' && start()).catch(() => {})
    }
    window.addEventListener('touchend', ask, { passive: true })
  }

  private onTilt(e: DeviceOrientationEvent) {
    if (e.beta === null || e.gamma === null) return
    // Map device axes to screen axes for the current orientation.
    const angle = screen.orientation?.angle ?? 0
    let side = e.gamma
    let fwd = e.beta
    if (angle === 90) [side, fwd] = [e.beta, -e.gamma]
    else if (angle === 270 || angle === -90) [side, fwd] = [-e.beta, e.gamma]
    else if (angle === 180) [side, fwd] = [-e.gamma, -e.beta]
    if (!this.rest) this.rest = { beta: fwd, gamma: side }
    // High-pass: the rest pose follows over a few seconds, so only gestures count.
    this.rest.beta += (fwd - this.rest.beta) * 0.01
    this.rest.gamma += (side - this.rest.gamma) * 0.01
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    this.tilt.x = clamp((side - this.rest.gamma) / TILT_RANGE)
    this.tilt.y = clamp((fwd - this.rest.beta) / TILT_RANGE)
    this.tilt.on = true
  }

  update(dt: number, now: number) {
    // Touch devices: contact decays after the finger stops; mouse stays present.
    const idle = now - this.lastMove
    const touching = this.lastMove !== 0 && (this.hasHover || idle < 1200)
    // A finger wins over tilt; tilt takes over again once it lifts.
    if (!touching && this.tilt.on) {
      this.target.x = this.tilt.x
      this.target.y = this.tilt.y
    }
    const k = 1 - Math.exp(-dt * 4)
    this.x += (this.target.x - this.x) * k
    this.y += (this.target.y - this.y) * k
    const fade = 1 - Math.exp(-dt * 3)
    this.contact += ((touching ? 1 : 0) - this.contact) * fade
    this.presence += ((touching || this.tilt.on ? 1 : 0) - this.presence) * fade
  }
}
