import { Color } from 'three'

/**
 * Shared color language.
 *   Blue / ice  = data at rest (racks, roads, land, idle traffic).
 *   Amber       = something is happening (hot hosts, GPU-bound work, agent gates,
 *                 arriving packets, the next light in the green wave).
 * Keep amber rare so it keeps meaning "look here".
 */
export const palette = {
  bg: new Color('#02040a'),
  deep: new Color('#0a1a3f'),
  blue: new Color('#1d4ed8'),
  cyan: new Color('#3fa9ff'),
  ice: new Color('#9fd8ff'),
  white: new Color('#ffffff'),
  amber: new Color('#ffb35c'),
}

/**
 * Semantic classes used by the point cloud "model" in the insight chapter.
 * Distinct hues at similar lightness, except road and structure, which stay quiet so the
 * objects on it stand out. Pedestrians get the amber "attention" color.
 */
export const classes = [
  { name: 'road', color: new Color('#2c4a86') },
  { name: 'vehicle', color: new Color('#38bdf8') },
  { name: 'pedestrian', color: new Color('#ffb35c') },
  { name: 'vegetation', color: new Color('#34d399') },
  { name: 'structure', color: new Color('#7d8bb0') },
] as const

export type ClassId = 0 | 1 | 2 | 3 | 4

/**
 * One sequential ramp for every "how busy is this" value (host heat, GPU load,
 * dashboard heatmaps): deep blue → cyan → ice → amber at the very top.
 */
const RAMP = [
  [0, new Color(0.06, 0.14, 0.42)],
  [0.4, new Color(0.25, 0.66, 1.0)],
  [0.75, new Color(0.72, 0.9, 1.0)],
  [1, new Color(1.0, 0.7, 0.36)],
] as const

export function loadRamp(t: number, out = new Color()) {
  t = Math.min(1, Math.max(0, t))
  let i = 0
  while (i < RAMP.length - 2 && t > RAMP[i + 1][0]) i++
  const [a, ca] = RAMP[i]
  const [b, cb] = RAMP[i + 1]
  return out.copy(ca).lerp(cb, (t - a) / (b - a))
}

export const loadRampGlsl = /* glsl */ `
  vec3 loadRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.4) return mix(vec3(0.06, 0.14, 0.42), vec3(0.25, 0.66, 1.0), t / 0.4);
    if (t < 0.75) return mix(vec3(0.25, 0.66, 1.0), vec3(0.72, 0.9, 1.0), (t - 0.4) / 0.35);
    return mix(vec3(0.72, 0.9, 1.0), vec3(1.0, 0.7, 0.36), (t - 0.75) / 0.25);
  }
`
