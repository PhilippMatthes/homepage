import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, SRGBColorSpace, Vector2 } from 'three'
import { themeGlsl, themeUniforms } from '../core/palette'
import { shared } from '../core/shared'
import { PORTRAIT_CENTER, PORTRAIT_SIZE } from '../world/layout'
import { loadPixels, sample } from './portrait'

/** Distance of the cover camera from the portrait (see the first camera key). */
const COVER_DISTANCE = 10.6

/** The room's round falloff, centred a little above the photo's middle (on the face). */
const FADE_CENTER_V = 0.45
const FADE_INNER = 0.45
const FADE_OUTER = 0.95

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** 1 in the middle of the photo, falling smoothly to 0 on a circle (radius in uv × 2). */
const roomFade = (u: number, v: number) => 1 - smoothstep(FADE_INNER, FADE_OUTER, Math.hypot(u - 0.5, v - FADE_CENTER_V) * 2)

/**
 * The room behind the portrait, as a LiDAR-style point cloud in the photo's
 * own colours. Positions come from the photo's whole-scene depth; the person is
 * left out (they are the 3D photo / portrait points), and the points thin out
 * towards a circle. Now and then a point on that rim is torn loose and flung
 * away on a widening spiral, like matter at a black hole's horizon.
 */
export class Backdrop {
  readonly points: Points
  private material: ShaderMaterial

  private constructor(pos: Float32Array, col: Float32Array, seed: Float32Array, rim: Float32Array) {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aColor', new BufferAttribute(col, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    g.setAttribute('aRim', new BufferAttribute(rim, 1))
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        ...themeUniforms,
        uScale: { value: 1 },
        uDensity: { value: 1 },
        uVisible: { value: 1 },
        uTime: { value: 0 },
        uFogDensity: shared.uFogDensity,
        uScanY: { value: 0 },
        uCenter: { value: new Vector2(PORTRAIT_CENTER.x, PORTRAIT_CENTER.y + (0.5 - FADE_CENTER_V) * PORTRAIT_SIZE) },
      },
      vertexShader: /* glsl */ `
        ${themeGlsl}
        uniform float uScale;
        uniform float uDensity;
        uniform float uVisible;
        uniform float uTime;
        uniform float uFogDensity;
        uniform float uScanY;
        uniform vec2 uCenter; // centre of the round falloff
        attribute vec3 aColor;
        attribute float aSeed;
        attribute float aRim; // 0 inside … 1 on the outermost rim of the falloff
        varying vec3 vColor;
        varying float vAlpha;
        const float ESCAPE = 0.2; // share of its cycle a rim point spends escaping
        void main() {
          vec3 p = position;
          float glow = 0.0;
          float fade = 1.0;
          // Event horizon: now and then a rim point lingers, then is flung outwards on a
          // widening spiral (all the same way round, like an accretion disk) and fades;
          // it re-forms in place a moment later.
          if (aRim > 0.0 && fract(aSeed * 91.7) < 0.5) {
            float period = 5.0 + 9.0 * fract(aSeed * 13.7);
            float ph = fract(uTime / period + fract(aSeed * 7.31));
            if (ph < ESCAPE) {
              float t = ph / ESCAPE;
              vec2 out2 = normalize(p.xy - uCenter + 1e-5);
              vec2 tang = vec2(-out2.y, out2.x);
              float e = t * t * t;
              p.xy += (out2 * 2.4 * e + tang * 0.7 * t * t) * aRim;
              p.z += 0.6 * e * aRim;
              glow = sin(3.14159 * t) * aRim;
              fade = 1.0 - e;
            } else {
              fade = smoothstep(ESCAPE, ESCAPE + 0.1, ph);
            }
            fade = mix(1.0, fade, aRim);
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          float size = 0.018 * uDensity * uScale / dist * (1.0 + 0.6 * glow);
          vAlpha = min(1.0, size / 1.2) * uVisible * fade;
          gl_PointSize = clamp(size, 1.2, 8.0);
          gl_Position = projectionMatrix * mv;
          // The same scan band as the portrait sweeps over the room.
          float band = exp(-pow((position.y - uScanY) / 0.07, 2.0));
          float tw = 0.85 + 0.15 * sin(uTime * 1.3 + aSeed * 50.0);
          vColor = (aColor * tw * (1.0 + 1.2 * glow) + uThGlow * band * 0.4) * exp(-pow(uFogDensity * dist, 2.0));
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
    const rim = new Float32Array(count)
    const tint = new Color()
    const rows = Math.round(Math.sqrt(count) * 0.7)
    let n = 0
    let guard = 0
    while (n < count && guard++ < count * 30) {
      const u = Math.random()
      const v = Math.random() < 0.75 ? (Math.floor(Math.random() * rows) + 0.5) / rows : Math.random()
      // Skip the person: they are rendered by the 3D photo and portrait points.
      if (sample(depth, u, v, 0) > 0.12) continue
      // Smooth round falloff: fewer and fewer points towards the circle.
      const edge = roomFade(u, v)
      if (Math.random() > Math.pow(edge, 1.2)) continue

      const s = sample(scene, u, v, 0)
      // The room sits behind the face (which spans roughly −0.6..+1.4 around the center).
      const z = PORTRAIT_CENTER.z - 3.2 + s * 2.2
      // Scale with distance behind the face so that, seen from the cover camera,
      // the room lines up with the photo (and the person-shaped gap hides behind the face).
      const spread = 1 + (PORTRAIT_CENTER.z - z) / COVER_DISTANCE
      pos[n * 3] = PORTRAIT_CENTER.x + (u - 0.5) * PORTRAIT_SIZE * spread
      pos[n * 3 + 1] = PORTRAIT_CENTER.y + (0.5 - v) * PORTRAIT_SIZE * spread
      pos[n * 3 + 2] = z
      // The photo's own colour (linear, like the rest of the scene).
      tint.setRGB(sample(photo, u, v, 0), sample(photo, u, v, 1), sample(photo, u, v, 2), SRGBColorSpace)
      const k = 0.75 * (0.45 + 0.55 * edge)
      col[n * 3] = k * tint.r
      col[n * 3 + 1] = k * tint.g
      col[n * 3 + 2] = k * tint.b
      rim[n] = 1 - smoothstep(0, 0.3, edge)
      seed[n] = Math.random()
      n++
    }
    return new Backdrop(pos.subarray(0, n * 3), col.subarray(0, n * 3), seed.subarray(0, n), rim.subarray(0, n))
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
