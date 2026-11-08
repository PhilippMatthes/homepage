/**
 * The whole page is one timeline over scroll progress p ∈ [0, 1].
 * Every chapter reads its own sub-range from here, so retiming the
 * experience means editing this file, the camera keys in cameraRig.ts
 * and the data-band ranges in index.html.
 */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Linear 0→1 progress of p inside [a, b]. */
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
export const smooth = (t: number) => t * t * (3 - 2 * t)
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
/** Fades in over [a, b], holds, fades out over [c, d]. */
export const band = (p: number, a: number, b: number, c: number, d: number) =>
  smooth(range(p, a, b)) * (1 - smooth(range(p, c, d)))

/** Scroll length of the experience, in viewport heights. */
export const SCROLL_VH = 2000

export const T = {
  // 3D photo burns away into the LiDAR point cloud...
  burn: [0.03, 0.06],
  // ...whose points rebuild right away into an app screen (chapter 01)
  stack: [0.035, 0.075],
  // once it has formed, it explodes into its view hierarchy, like a 3D view debugger
  stackSpread: [0.07, 0.097],
  // the layers slam back together...
  stackSlam: [0.114, 0.128],
  // ...and the screen's points rain onto the datacenter
  dissolve: [0.13, 0.22],
  hallIn: [0.12, 0.19],
  network: [0.15, 0.2, 0.29, 0.33],
  roof: [0.29, 0.34],
  // Cortex: VMs drop into the racks along the aisle, then hot hosts get rebalanced
  cortexVisible: [0.385, 0.4, 0.47, 0.495],
  place: [0.395, 0.44],
  rebalance: [0.44, 0.47],
  // descend to the target rack, then pull a server out
  slide: [0.42, 0.46],
  lid: [0.45, 0.49],
  flows: [0.45, 0.48, 0.58, 0.62],
  heat: [0.52, 0.56, 0.6, 0.64],
  // jobs run through the agent pipeline, which calls inference on the GPU
  agents: [0.5, 0.515, 0.56, 0.575],
  // data streams into the GPU, then up into the Perses dashboards
  // (starts as the agent pipeline fades, so the two don't compete)
  ingest: [0.55, 0.58],
  dash: [0.578, 0.615],
  dashVisible: [0.57, 0.61, 0.68, 0.72],
  // dashboards → point cloud; hall and server fade away
  burst: [0.68, 0.73],
  hallOut: [0.68, 0.74],
  insight: [0.68, 0.73, 0.8, 0.83],
  sweep: [0.735, 0.79],
  // zoom out: cloud → city road network
  city: [0.81, 0.86],
  cityVisible: [0.83, 0.86, 0.92, 0.94],
  greenWave: [0.855, 0.92],
  // zoom out further: city → globe
  globe: [0.92, 0.97],
  globeVisible: [0.915, 0.965, 2, 2],
} as const

/**
 * Particle morph state: 0 portrait, 1 datacenter LEDs, 2 GPU core,
 * 3 dashboards, 4 point cloud, 5 city, 6 globe.
 */
export function morphAt(p: number): number {
  const seq: Array<[number, number, number]> = [
    [T.dissolve[0], T.dissolve[1], 0],
    [T.ingest[0], T.ingest[1], 1],
    [T.dash[0], T.dash[1], 2],
    [T.burst[0], T.burst[1], 3],
    [T.city[0], T.city[1], 4],
    [T.globe[0], T.globe[1], 5],
  ]
  for (const [a, b, from] of seq) {
    if (p < a) return from
    if (p < b) return from + smooth(range(p, a, b))
  }
  return 6
}
