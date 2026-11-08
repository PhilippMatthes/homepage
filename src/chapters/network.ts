import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Points,
  QuadraticBezierCurve3,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette, shade, themeUniforms } from '../core/palette'
import { holoMaterial, setHoloFade } from '../fx/holoMaterial'
import { HALL } from '../world/layout'
import { packetGlsl } from '../fx/packets'

/**
 * Other datacenters around the main hall, linked by glowing fibre routes
 * with data pulses: the main hall is one of many.
 */
export class Network {
  readonly group = new Group()
  private shellMat = holoMaterial({ transparent: true, panels: 2.4, fill: shade(palette.deep, 0.4), edge: palette.cyan, glow: 0.9 })
  private unitMat = holoMaterial({ transparent: true, fill: shade(palette.deep, 0.58), edge: palette.ice, glow: 0.8 })
  private linkMat = new LineBasicMaterial({ color: palette.cyan, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
  private pulseMat: ShaderMaterial
  private pulseGeo: BufferGeometry
  private curves: QuadraticBezierCurve3[] = []
  private tmp = new Vector3()
  static readonly TAIL = 10

  constructor() {
    const sites: Array<{ p: Vector3; s: number; r: number }> = []
    const n = 9
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.35 * Math.sin(i * 2.3)
      const d = 62 + 38 * ((i * 0.618) % 1)
      sites.push({ p: new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), s: 0.45 + 0.35 * ((i * 0.37) % 1), r: (i % 2) * Math.PI / 2 })
    }
    for (const { p, s, r } of sites) {
      const b = new Group()
      b.position.copy(p)
      b.rotation.y = r
      const shell = new Mesh(new BoxGeometry(2 * HALL.halfX * s, HALL.height, 2 * HALL.halfZ * s), this.shellMat)
      shell.position.y = HALL.height / 2
      b.add(shell)
      for (let j = -1; j <= 1; j++) {
        const unit = new Mesh(new BoxGeometry(1.4, 0.45, 1.3), this.unitMat)
        unit.position.set(0, HALL.height + 0.25, j * HALL.halfZ * s * 0.55)
        b.add(unit)
      }
      this.group.add(b)
    }

    // Fibre routes: hub to every site, plus a ring between neighbours.
    const hub = new Vector3(0, HALL.height, 0)
    const roof = (v: Vector3) => v.clone().setY(HALL.height)
    const link = (a: Vector3, b: Vector3) => {
      const mid = a.clone().add(b).multiplyScalar(0.5)
      mid.y += a.distanceTo(b) * 0.22
      const c = new QuadraticBezierCurve3(a, mid, b)
      this.curves.push(c)
      this.group.add(new Line(new BufferGeometry().setFromPoints(c.getPoints(48)), this.linkMat))
    }
    sites.forEach(({ p }, i) => {
      link(hub, roof(p))
      link(roof(p), roof(sites[(i + 1) % n].p))
    })

    const T = Network.TAIL
    this.pulseGeo = new BufferGeometry()
    this.pulseGeo.setAttribute('position', new BufferAttribute(new Float32Array(this.curves.length * 2 * T * 3), 3))
    const fade = new Float32Array(this.curves.length * 2 * T)
    for (let i = 0; i < fade.length; i++) fade[i] = 1 - (i % T) / T
    this.pulseGeo.setAttribute('aFade', new BufferAttribute(fade, 1))
    // Per packet (shared by its whole tail): a random value for the rare hot packet,
    // and its direction. Packets alternate direction (see update), so color says
    // which way they run: outbound from the hub vs. back in.
    const tint = new Float32Array(fade.length)
    const dir = new Float32Array(fade.length)
    for (let q = 0; q < tint.length / T; q++) {
      tint.fill(Math.random(), q * T, q * T + T)
      dir.fill(q % 2 === Math.floor(q / 2) % 2 ? -1 : 1, q * T, q * T + T)
    }
    this.pulseGeo.setAttribute('aTint', new BufferAttribute(tint, 1))
    this.pulseGeo.setAttribute('aDir', new BufferAttribute(dir, 1))
    this.pulseMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uVisible; uniform float uScale;
        attribute float aFade; attribute float aTint; attribute float aDir; varying float vA; varying vec3 vColor;
        ${packetGlsl}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(0.9 * uScale / -mv.z * aFade, 1.0, 10.0);
          vA = aFade * uVisible;
          vColor = packetColor(aDir, aTint);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vColor * exp(-r * 2.5) * vA * 1.6, 1.0);
        }`,
    })
    const pulses = new Points(this.pulseGeo, this.pulseMat)
    pulses.frustumCulled = false
    this.group.add(pulses)
  }

  update(visible: number, time: number, scale: number) {
    this.group.visible = visible > 0.001
    if (!this.group.visible) return
    setHoloFade(this.shellMat, visible, 0.9 * visible)
    setHoloFade(this.unitMat, visible, visible)
    this.linkMat.opacity = 0.45 * visible
    this.pulseMat.uniforms.uVisible.value = visible
    this.pulseMat.uniforms.uScale.value = scale
    const pos = this.pulseGeo.attributes.position as BufferAttribute
    const T = Network.TAIL
    this.curves.forEach((c, i) => {
      for (let k = 0; k < 2; k++) {
        const head = (time * 0.22 + i * 0.29 + k * 0.5) % 1
        // Alternate direction so data flows both ways.
        for (let j = 0; j < T; j++) {
          let t = Math.max(0, head - j * 0.008)
          if ((i + k) % 2) t = 1 - t
          c.getPoint(t, this.tmp)
          pos.setXYZ((i * 2 + k) * T + j, this.tmp.x, this.tmp.y, this.tmp.z)
        }
      }
    })
    pos.needsUpdate = true
  }
}
