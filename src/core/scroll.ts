import Lenis from 'lenis'
import { reducedMotion } from './quality'

/**
 * Smooth, inertial scroll (Lenis) mapped to a single progress value.
 * `progress` is additionally damped so camera flights never snap,
 * even when the user drags the scrollbar.
 */
export class Scroll {
  private lenis: Lenis | null = null
  /** Damped progress used for rendering. */
  progress = 0
  /** Velocity of the damped progress (per second), handy for motion effects. */
  velocity = 0

  constructor() {
    if (!reducedMotion) {
      this.lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, touchMultiplier: 1.4 })
    }
    this.progress = this.raw()
  }

  /** Undamped progress straight from the scroll position. */
  raw() {
    const max = document.documentElement.scrollHeight - innerHeight
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
  }

  update(time: number, dt: number) {
    this.lenis?.raf(time)
    const target = this.raw()
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 6)
    const prev = this.progress
    this.progress += (target - this.progress) * k
    if (Math.abs(target - this.progress) < 1e-5) this.progress = target
    this.velocity = dt > 0 ? (this.progress - prev) / dt : 0
  }

  /** Jump without animation (used for deep links on load). */
  jumpTo(p: number) {
    const max = document.documentElement.scrollHeight - innerHeight
    if (this.lenis) this.lenis.scrollTo(p * max, { immediate: true })
    else scrollTo({ top: p * max })
    this.progress = p
  }

  scrollTo(p: number) {
    const max = document.documentElement.scrollHeight - innerHeight
    // Longer jumps take longer, so the camera flight stays readable.
    if (this.lenis) this.lenis.scrollTo(p * max, { duration: 1.2 + 3.5 * Math.abs(p - this.raw()) })
    else scrollTo({ top: p * max })
  }
}
