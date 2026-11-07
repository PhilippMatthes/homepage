import { Vector2 } from 'three'

/**
 * Uniform objects shared by every material. Three.js lets materials hold
 * the same uniform object, so updating it once per frame updates them all.
 */
export const shared = {
  /** Exp² fog density; scaled with camera distance so every zoom level reads the same. */
  uFogDensity: { value: 0.035 },
  /** Hall focus: half extents of the elliptical falloff, and how strongly it applies. */
  uFocusExtent: { value: new Vector2(7.2, 14.5) },
  uFocusAmount: { value: 1 },
}
