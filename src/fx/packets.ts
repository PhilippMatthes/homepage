import { themeGlsl } from '../core/palette'

/**
 * Data packets carry meaning in their color (hall streams, fibre routes, board traces):
 *   dir > 0  → ingress, spark (near white)
 *   dir < 0  → egress, glow (bright primary)
 *   r > 0.95 → a rare "hot" packet in the attention color (the section's accent, see palette.ts)
 * `r` is a per-packet random value in [0, 1).
 */
export const packetGlsl = /* glsl */ `
  ${themeGlsl}
  vec3 packetColor(float dir, float r) {
    if (r > 0.95) return uThHot;
    return dir >= 0.0 ? uThSpark : uThGlow;
  }
`
