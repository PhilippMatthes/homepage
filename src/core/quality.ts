/** Device-dependent budgets. Picked once at boot, downgraded if FPS drops. */
export interface Quality {
  tier: 'high' | 'medium' | 'low'
  particles: number
  pulses: number
  maxDpr: number
  bloom: boolean
  chroma: boolean
}

const TIERS: Record<Quality['tier'], Quality> = {
  high: { tier: 'high', particles: 140_000, pulses: 700, maxDpr: 2, bloom: true, chroma: true },
  medium: { tier: 'medium', particles: 80_000, pulses: 420, maxDpr: 1.5, bloom: true, chroma: false },
  low: { tier: 'low', particles: 40_000, pulses: 220, maxDpr: 1, bloom: true, chroma: false },
}

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

export function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get('quality')
  if (q === 'high' || q === 'medium' || q === 'low') return TIERS[q]
  const coarse = matchMedia('(pointer: coarse)').matches
  const small = Math.min(screen.width, screen.height) < 700
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse && small) return cores >= 8 ? TIERS.medium : TIERS.low
  if (cores <= 4) return TIERS.medium
  return TIERS.high
}

export function lowerTier(q: Quality): Quality | null {
  if (q.tier === 'high') return TIERS.medium
  if (q.tier === 'medium') return TIERS.low
  return null
}

/** Rolling FPS monitor; calls back once when sustained FPS is too low. */
export class FpsWatchdog {
  private frames = 0
  private start = performance.now()
  private strikes = 0
  constructor(private onSlow: () => void, private threshold = 40) {}
  tick(now: number) {
    this.frames++
    const dt = now - this.start
    if (dt < 2000) return
    const fps = (this.frames * 1000) / dt
    this.frames = 0
    this.start = now
    this.strikes = fps < this.threshold ? this.strikes + 1 : 0
    if (this.strikes >= 2) {
      this.strikes = 0
      this.onSlow()
    }
  }
  /** Ignore the frames of a hidden tab or a stall. */
  reset() {
    this.frames = 0
    this.start = performance.now()
  }
}
