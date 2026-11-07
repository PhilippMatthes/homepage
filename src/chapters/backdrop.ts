import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import { shared } from '../core/shared'
import { PORTRAIT_CENTER, PORTRAIT_SIZE } from '../world/layout'
import { loadPixels, sample } from './portrait'

/** Distance of the cover camera from the portrait (see the first camera key). */
const COVER_DISTANCE = 10.6

/**
 * The room behind the portrait, as a dim LiDAR-style point cloud. Positions
 * come from the photo's whole-scene depth; the person is left out (they are
 * the 3D photo / portrait points), and density fades out towards the edges.
 */
export class Backdrop {
  readonly points: Points
  private material: ShaderMaterial

  private constructor(pos: Float32Array, col: Float32Array, seed: Float32Array) {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aColor', new BufferAttribute(col, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uDensity: { value: 1 },
        uVisible: { value: 1 },
        uTime: { value: 0 },
        uFogDensity: shared.uFogDensity,
        uScanY: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uDensity;
        uniform float uVisible;
        uniform float uTime;
        uniform float uFogDensity;
        uniform float uScanY;
        attribute vec3 aColor;
        attribute float aSeed;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          float size = 0.018 * uDensity * uScale / dist;
          vAlpha = min(1.0, size / 1.2) * uVisible;
          gl_PointSize = clamp(size, 1.2, 8.0);
          gl_Position = projectionMatrix * mv;
          // The same scan band as the portrait sweeps over the room.
          float band = exp(-pow((position.y - uScanY) / 0.07, 2.0));
          float tw = 0.85 + 0.15 * sin(uTime * 1.3 + aSeed * 50.0);
          vColor = (aColor * tw + vec3(0.5, 0.75, 1.0) * band * 0.35) * exp(-pow(uFogDensity * dist, 2.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = dot(c, c) * 4.0;
          if (r > 1.0) discard;
          gl_FragColor = vec4(vColor * exp(-r * 2.6) * vAlpha, 1.0);
        }
      `,
    })
    this.points = new Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = -3
  }

  static async load(count: number, photoUrl: string, depthUrl: string, sceneUrl: string) {
    const [photo, depth, scene] = await Promise.all([loadPixels(photoUrl), loadPixels(depthUrl), loadPixels(sceneUrl)])
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const rows = Math.round(Math.sqrt(count) * 0.7)
    let n = 0
    let guard = 0
    while (n < count && guard++ < count * 30) {
      const u = Math.random()
      const v = Math.random() < 0.75 ? (Math.floor(Math.random() * rows) + 0.5) / rows : Math.random()
      // Skip the person: they are rendered by the 3D photo and portrait points.
      if (sample(depth, u, v, 0) > 0.12) continue
      // Soft rounded-rectangle falloff so the photo's borders never show.
      const ex = Math.max(0, Math.abs(u - 0.5) * 2 - 0.55) / 0.45
      const ey = Math.max(0, Math.abs(v - 0.5) * 2 - 0.55) / 0.45
      const edge = Math.max(0, 1 - Math.sqrt(ex * ex + ey * ey))
      if (Math.random() > edge * edge) continue

      const s = sample(scene, u, v, 0)
      const l = 0.299 * sample(photo, u, v, 0) + 0.587 * sample(photo, u, v, 1) + 0.114 * sample(photo, u, v, 2)
      // The room sits behind the face (which spans roughly −0.6..+1.4 around the center).
      const z = PORTRAIT_CENTER.z - 3.2 + s * 2.2
      // Scale with distance behind the face so that, seen from the cover camera,
      // the room lines up with the photo (and the person-shaped gap hides behind the face).
      const spread = 1 + (PORTRAIT_CENTER.z - z) / COVER_DISTANCE
      pos[n * 3] = PORTRAIT_CENTER.x + (u - 0.5) * PORTRAIT_SIZE * spread
      pos[n * 3 + 1] = PORTRAIT_CENTER.y + (0.5 - v) * PORTRAIT_SIZE * spread
      pos[n * 3 + 2] = z
      const k = (0.14 + 0.55 * Math.pow(l, 1.2)) * (0.45 + 0.55 * edge)
      col[n * 3] = k * 0.8
      col[n * 3 + 1] = k * 0.92
      col[n * 3 + 2] = k * 1.1
      seed[n] = Math.random()
      n++
    }
    return new Backdrop(pos.subarray(0, n * 3), col.subarray(0, n * 3), seed.subarray(0, n))
  }

  /** Point-size factor for sparser clouds (see densityComp in core/quality.ts). */
  setDensity(k: number) {
    this.material.uniforms.uDensity.value = k
  }

  update(visible: number, time: number, scale: number, scanY: number) {
    this.points.visible = visible > 0.001
    const u = this.material.uniforms
    u.uVisible.value = visible
    u.uTime.value = time
    u.uScale.value = scale
    u.uScanY.value = scanY
  }
}
