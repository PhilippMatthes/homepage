import { Color } from 'three'

/** Shared color language: near-black navy, deep blues, cyan accents, white data. */
export const palette = {
  bg: new Color('#02040a'),
  deep: new Color('#0a1a3f'),
  blue: new Color('#1d4ed8'),
  cyan: new Color('#3fa9ff'),
  ice: new Color('#9fd8ff'),
  white: new Color('#ffffff'),
}

/** Semantic classes used by the point cloud "model" in the insight chapter. */
export const classes = [
  { name: 'road', color: new Color('#1e40af') },
  { name: 'vehicle', color: new Color('#38bdf8') },
  { name: 'pedestrian', color: new Color('#c084fc') },
  { name: 'vegetation', color: new Color('#2dd4bf') },
  { name: 'structure', color: new Color('#6366f1') },
] as const

export type ClassId = 0 | 1 | 2 | 3 | 4
