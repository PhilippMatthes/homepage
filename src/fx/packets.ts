/**
 * Data packets carry meaning in their color (hall streams, fibre routes, board traces):
 *   dir > 0  → ingress, ice-white
 *   dir < 0  → egress, cyan
 *   r > 0.95 → a rare amber "hot" packet (see palette.ts: amber means activity)
 * `r` is a per-packet random value in [0, 1).
 */
export const packetGlsl = /* glsl */ `
  const vec3 PKT_IN = vec3(0.85, 0.95, 1.0);
  const vec3 PKT_OUT = vec3(0.3, 0.72, 1.0);
  const vec3 PKT_HOT = vec3(1.0, 0.7, 0.36);
  vec3 packetColor(float dir, float r) {
    if (r > 0.95) return PKT_HOT;
    return dir >= 0.0 ? PKT_IN : PKT_OUT;
  }
`
