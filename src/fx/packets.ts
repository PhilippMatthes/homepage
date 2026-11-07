/**
 * Shared color variation for data packets (hall streams, fibre routes, board traces):
 * mostly ice-white, some cyan, violet and mint, and a rare warm accent.
 * `r` is a per-packet random value in [0, 1).
 */
export const packetGlsl = /* glsl */ `
  vec3 packetColor(float r) {
    if (r < 0.5) return vec3(0.85, 0.95, 1.0);   // ice-white
    if (r < 0.7) return vec3(0.35, 0.78, 1.0);   // cyan
    if (r < 0.84) return vec3(0.68, 0.62, 1.0);  // violet
    if (r < 0.95) return vec3(0.45, 1.0, 0.8);   // mint
    return vec3(1.0, 0.72, 0.42);                // amber, rare
  }
`
