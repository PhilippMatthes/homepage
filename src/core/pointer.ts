import { reducedMotion } from './quality'

/**
 * Normalized pointer in [-1, 1]² (y up), smoothed with critically damped
 * easing so everything that follows it glides instead of jittering.
 */
export class Pointer {
  /** Raw target. */
  readonly target = { x: 0, y: 0 }
  /** Smoothed value. */
  x = 0
  y = 0
  /** 0..1 — how "present" the pointer is (fades out when idle / left window). */
  presence = 0
  private lastMove = 0
  private hasHover = matchMedia('(hover: hover)').matches

  constructor() {
    if (reducedMotion) return
    window.addEventListener('pointermove', (e) => this.set(e.clientX, e.clientY), { passive: true })
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      if (t) this.set(t.clientX, t.clientY)
    }, { passive: true })
    document.addEventListener('pointerleave', () => (this.lastMove = 0))
  }

  private set(cx: number, cy: number) {
    this.target.x = (cx / innerWidth) * 2 - 1
    this.target.y = -((cy / innerHeight) * 2 - 1)
    this.lastMove = performance.now()
  }

  update(dt: number, now: number) {
    const k = 1 - Math.exp(-dt * 4)
    this.x += (this.target.x - this.x) * k
    this.y += (this.target.y - this.y) * k
    // Touch devices: presence decays after the finger stops; mouse stays present.
    const idle = now - this.lastMove
    const want = this.lastMove === 0 ? 0 : this.hasHover ? 1 : idle < 1200 ? 1 : 0
    this.presence += (want - this.presence) * (1 - Math.exp(-dt * 3))
  }
}
