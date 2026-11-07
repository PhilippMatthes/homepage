import { HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three'
const BLOOM_LEVELS = 8
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing'
import { palette } from './palette'
import type { Quality } from './quality'

/** Renderer, camera, scene and the post-processing chain. */
export class Stage {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(40, 1, 0.005, 200)
  readonly composer: EffectComposer
  readonly bloom: BloomEffect
  readonly chroma: ChromaticAberrationEffect
  private resizeListeners: Array<() => void> = []
  /** Pixels per world unit at distance 1, used to size points in shaders. */
  pointScale = 1
  dpr = 1

  constructor(canvas: HTMLCanvasElement, private quality: Quality) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.setClearColor(palette.bg, 1)

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloom = new BloomEffect({
      luminanceThreshold: 0.22,
      luminanceSmoothing: 0.4,
      intensity: 1.0,
      radius: 0.68,
      mipmapBlur: true,
      levels: BLOOM_LEVELS,
    })
    this.chroma = new ChromaticAberrationEffect({
      offset: new Vector2(0.0006, 0.0006),
      radialModulation: true,
      modulationOffset: 0.25,
    })
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.72 })
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
    noise.blendMode.opacity.value = 0.06
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })

    // Phones skip the film grain: it is a subtle overlay but a full-screen cost.
    const effects = quality.noise ? [this.bloom, tone, vignette, noise] : [this.bloom, tone, vignette]
    this.composer.addPass(new EffectPass(this.camera, ...effects))
    // Chromatic aberration is a convolution effect and needs its own pass.
    if (quality.chroma) this.composer.addPass(new EffectPass(this.camera, this.chroma))

    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  onResize(fn: () => void) {
    this.resizeListeners.push(fn)
  }

  setQuality(q: Quality) {
    this.quality = q
    this.resize()
  }

  resize() {
    const w = innerWidth
    const h = innerHeight
    this.dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h, false)
    this.sizeBloom()
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.updatePointScale()
    for (const fn of this.resizeListeners) fn()
  }

  /**
   * With mipmap blur, the bloom's resolution scale is ignored, so on lean tiers
   * the luminance and blur chain are resized by hand. One MIP level less keeps
   * the glow radius the same on screen.
   */
  private sizeBloom() {
    const s = this.quality.bloomScale
    const size = this.renderer.getDrawingBufferSize(new Vector2())
    const w = Math.max(1, Math.round(size.x * s))
    const h = Math.max(1, Math.round(size.y * s))
    this.bloom.luminancePass.setSize(w, h)
    this.bloom.mipmapBlurPass.levels = s < 1 ? BLOOM_LEVELS - Math.round(Math.log2(1 / s)) : BLOOM_LEVELS
    this.bloom.mipmapBlurPass.setSize(w, h)
  }

  /**
   * Fast-scroll "warp": 0 at rest, 1 at full speed. Widens the chromatic
   * aberration and lifts the bloom a little; both settle back when scrolling stops.
   * `bloom` is the chapter's base glow (see bloomAt in mood.ts).
   */
  setWarp(w: number, bloom = { intensity: 1, threshold: 0.22 }) {
    const o = 0.0006 + 0.0034 * w
    this.chroma.offset.set(o, o)
    this.bloom.intensity = bloom.intensity * (1 + 0.35 * w)
    this.bloom.luminanceMaterial.threshold = bloom.threshold
  }

  /** Must be called whenever the fov changes. */
  updatePointScale() {
    const fov = (this.camera.fov * Math.PI) / 180
    this.pointScale = (innerHeight * this.dpr) / (2 * Math.tan(fov / 2))
  }

  render(dt: number) {
    this.composer.render(dt)
  }
}
