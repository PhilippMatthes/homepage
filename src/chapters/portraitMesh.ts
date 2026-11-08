import { LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three'
import { burnGlsl } from '../fx/particles'
import { palette } from '../core/palette'
import { PORTRAIT_CENTER, PORTRAIT_DEPTH, PORTRAIT_SIZE } from '../world/layout'

/**
 * The cover: the real photo, displaced in 3D by its depth map (like 3Dify),
 * reacting to the pointer. It then burns away along the same noise field
 * the point cloud uses to appear, so photo and points hand over seamlessly.
 */
export class PortraitMesh {
  readonly mesh: Mesh
  readonly material: ShaderMaterial

  constructor(photo: Texture, depth: Texture) {
    photo.colorSpace = SRGBColorSpace
    for (const t of [photo, depth]) {
      t.minFilter = LinearFilter
      t.magFilter = LinearFilter
      t.generateMipmaps = false
    }
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uPhoto: { value: photo },
        uDepth: { value: depth },
        uDepthScale: { value: PORTRAIT_DEPTH },
        uBurn: { value: -0.1 },
        uPointer: { value: new Vector3(0, 0, 100) },
        uPointerStrength: { value: 0 },
        uTime: { value: 0 },
        uVisible: { value: 1 },
        // Shared with the clear color, so the shadows follow the background mood.
        uShadow: { value: palette.bg },
        uTexel: { value: 1 / ((depth.image as { width?: number })?.width ?? 1024) },
        uLightDir: { value: new Vector3(-0.45, 0.55, 0.7).normalize() },
        uRim: { value: palette.cyan },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D uDepth;
        uniform float uDepthScale;
        uniform vec3 uPointer;
        uniform float uPointerStrength;
        uniform float uTime;
        varying vec2 vUv;
        varying float vDepth;
        varying float vTouch;
        void main() {
          vUv = uv;
          float d = texture2D(uDepth, uv).r;
          vDepth = d;
          vec3 p = position;
          p.z += (d - 0.5) * uDepthScale;
          vec4 w = modelMatrix * vec4(p, 1.0);
          vec3 dp = w.xyz - uPointer;
          float r = length(dp.xy);
          float f = exp(-r * r * 3.5) * uPointerStrength;
          vTouch = f;
          w.z += f * (0.18 + 0.06 * (sin(r * 14.0 - uTime * 5.0) * 0.5 + 0.5));
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPhoto;
        uniform sampler2D uDepth;
        uniform float uDepthScale;
        uniform float uTexel;
        uniform vec3 uLightDir;
        uniform vec3 uRim;
        uniform vec3 uShadow;
        uniform float uBurn;
        uniform float uVisible;
        varying vec2 vUv;
        varying float vDepth;
        varying float vTouch;
        ${burnGlsl}
        void main() {
          // Same soft vignette as the point cloud, plus a cut where the depth map is background.
          vec2 q = vec2((vUv.x - 0.5) / 0.52, ((1.0 - vUv.y) - 0.5) / 0.56);
          float vig = smoothstep(0.0, 0.45, 1.0 - length(q));
          float bottom = 1.0 - clamp(((1.0 - vUv.y) - 0.8) / 0.19, 0.0, 1.0);
          float a = vig * bottom * bottom * smoothstep(0.17, 0.27, vDepth);

          float d = burnField(vUv);
          float burnt = smoothstep(d, d + 0.02, uBurn);
          float edge = exp(-pow((uBurn - d) / 0.025, 2.0));
          a *= 1.0 - burnt;
          if (a < 0.01) discard;

          // Broad-form normal: depth gradients averaged over large, multi-scale
          // offsets so the 8-bit depth steps never show up as contour lines.
          vec2 g = vec2(0.0);
          for (int i = 1; i <= 3; i++) {
            float o = uTexel * float(i * i) * 6.0;
            g.x += texture2D(uDepth, vUv + vec2(o, 0.0)).r - texture2D(uDepth, vUv - vec2(o, 0.0)).r;
            g.y += texture2D(uDepth, vUv + vec2(0.0, o)).r - texture2D(uDepth, vUv - vec2(0.0, o)).r;
          }
          float span = uTexel * 6.0 * (1.0 + 4.0 + 9.0) * 2.0;
          float k = uDepthScale / (span * ${PORTRAIT_SIZE.toFixed(2)});
          vec3 n = normalize(vec3(-g * k, 1.0));

          // Gentle key light that follows the pointer: modulates the photo, never replaces it.
          float key = clamp((dot(n, normalize(uLightDir)) + 0.5) / 1.5, 0.0, 1.0);
          // Faint cool glow only along the outer silhouette (where the depth falls off).
          float silhouette = 1.0 - smoothstep(0.27, 0.45, vDepth);

          vec3 photo = texture2D(uPhoto, vUv).rgb;
          vec3 c = photo;
          // Greyscale, lightly lit and lifted, then a near-neutral duotone whose
          // shadows sink into the background.
          float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float l = l0;
          l = clamp(l * mix(0.85, 1.25, key) * 1.12 + 0.03, 0.0, 1.0);
          vec3 mid = vec3(0.22, 0.25, 0.31);
          vec3 high = vec3(0.96, 0.97, 1.0);
          c = l < 0.42 ? mix(uShadow, mid, l / 0.42) : mix(mid, high, (l - 0.42) / 0.58);
          // A hint of the photo's own colour (its chroma, so brightness stays put), kept out of the shadows.
          c = max(c + (photo - vec3(l0)) * 0.3 * smoothstep(0.08, 0.35, l), 0.0);
          c += uRim * silhouette * 0.22;
          c += vec3(0.55, 0.85, 1.0) * edge * 2.2 + vec3(0.6, 0.85, 1.0) * vTouch * 0.25;
          gl_FragColor = vec4(c, a * uVisible);
          #include <colorspace_fragment>
        }
      `,
    })
    const geo = new PlaneGeometry(PORTRAIT_SIZE, PORTRAIT_SIZE, 255, 255)
    this.mesh = new Mesh(geo, this.material)
    this.mesh.position.copy(PORTRAIT_CENTER)
    this.mesh.renderOrder = -4
  }

  static async load(photoUrl: string, depthUrl: string) {
    const loader = new TextureLoader()
    const [photo, depth] = await Promise.all([loader.loadAsync(photoUrl), loader.loadAsync(depthUrl)])
    return new PortraitMesh(photo, depth)
  }

  /**
   * @param light pointer in [-1, 1]² steering the key light (with a slow idle drift)
   */
  update(burn: number, time: number, pointer: Vector3, strength: number, light: { x: number; y: number; presence: number }) {
    this.mesh.visible = burn < 1.05
    const u = this.material.uniforms
    const idleX = -0.45 + Math.sin(time * 0.25) * 0.15
    const idleY = 0.5 + Math.sin(time * 0.19 + 1) * 0.1
    const lx = idleX + (light.x * 0.9 - idleX) * light.presence * 0.8
    const ly = idleY + (light.y * 0.7 + 0.2 - idleY) * light.presence * 0.8
    u.uLightDir.value.set(lx, ly, 0.75).normalize()
    u.uBurn.value = burn
    u.uTime.value = time
    u.uPointer.value.copy(pointer)
    u.uPointerStrength.value = strength
  }
}
