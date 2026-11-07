import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette } from '../core/palette'
import { holoMaterial } from '../fx/holoMaterial'
import { packetGlsl } from '../fx/packets'
import { SERVER, SERVER_HOME, SERVER_SLIDE } from '../world/layout'

type V2 = [number, number]
/** A trace on the board: 4 points in board space (x, z). */
type Trace = [V2, V2, V2, V2]

const BOARD_Y = -SERVER.h / 2 + 0.003
/**
 * The board layout below is designed for a 0.44 m wide board and stretched
 * to the server's real width, so components and traces scale together.
 */
const XS = (SERVER.w - 0.01) / 0.43
const GPU = { x: 0, z: 0.11, w: 0.24, d: 0.13, h: 0.022 }
const CPUS: V2[] = [
  [-0.1, -0.07],
  [0.1, -0.07],
]
const CPU_SIZE = 0.068

function buildTraces(): Trace[] {
  const traces: Trace[] = []
  const jitter = () => (Math.random() - 0.5) * 0.006
  // Memory → CPU: 16 DIMMs in a bank behind the CPUs.
  for (let i = 0; i < 16; i++) {
    const x = -0.19 + (i * 0.38) / 15
    const c = x < 0 ? CPUS[0] : CPUS[1]
    const zA = -0.135 + (i % 4) * 0.005 + jitter()
    const xc = c[0] + ((i % 8) - 3.5) * 0.007
    traces.push([[x, -0.165], [x, zA], [xc, zA], [xc, c[1] - CPU_SIZE / 2]])
  }
  // CPU → GPU: wide parallel buses.
  for (const c of CPUS) {
    for (let l = 0; l < 14; l++) {
      const off = (l - 6.5) * 0.0042
      const x0 = c[0] + off
      const zB = 0.0 + l * 0.0022 * Math.sign(c[0])
      const xg = GPU.x + Math.sign(c[0]) * 0.035 + off * 0.8
      traces.push([[x0, c[1] + CPU_SIZE / 2], [x0, zB + 0.01], [xg, zB + 0.01], [xg, GPU.z - GPU.d / 2]])
    }
  }
  // Network → GPU: from the front I/O ports.
  for (let i = 0; i < 12; i++) {
    const x = -0.17 + (i * 0.34) / 11
    const zC = 0.255 - (i % 3) * 0.006
    const xg = GPU.x + (i - 5.5) * 0.016
    traces.push([[x, 0.31], [x, zC], [xg, zC], [xg, GPU.z + GPU.d / 2]])
  }
  // CPU ↔ CPU interconnect.
  for (let l = 0; l < 6; l++) {
    const z = CPUS[0][1] + (l - 2.5) * 0.006
    traces.push([[CPUS[0][0] + CPU_SIZE / 2, z], [-0.02, z], [0.02, z], [CPUS[1][0] - CPU_SIZE / 2, z]])
  }
  return traces
}

const pulseVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform float uVisible;
  uniform float uSpeed;
  attribute vec3 aP0;
  attribute vec3 aP1;
  attribute vec3 aP2;
  attribute vec3 aP3;
  attribute vec3 aSeed; // phase, speed, brightness
  attribute float aLag;
  varying float vAlpha;
  varying vec3 vColor;
  ${packetGlsl}

  void main() {
    vColor = packetColor(fract(aSeed.y * 7.31 + aSeed.x * 3.7));
    float l1 = length(aP1 - aP0);
    float l2 = length(aP2 - aP1);
    float l3 = length(aP3 - aP2);
    float L = l1 + l2 + l3;
    float ph = fract(aSeed.x + uTime * uSpeed * (0.12 + 0.18 * aSeed.y) / L * 0.25);
    float s = ph * L - aLag * 0.0022;
    vec3 p;
    if (s < l1) p = mix(aP0, aP1, clamp(s / max(l1, 1e-5), 0.0, 1.0));
    else if (s < l1 + l2) p = mix(aP1, aP2, (s - l1) / max(l2, 1e-5));
    else p = mix(aP2, aP3, clamp((s - l1 - l2) / max(l3, 1e-5), 0.0, 1.0));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(0.001, -mv.z);
    gl_PointSize = clamp(uSize * uScale / dist * (1.0 - aLag * 0.06), 1.0, 24.0);
    gl_Position = projectionMatrix * mv;
    float ends = smoothstep(0.0, 0.04, ph) * smoothstep(1.0, 0.94, ph);
    vAlpha = (1.0 - aLag / 10.0) * ends * uVisible * (0.6 + 0.8 * aSeed.z) * step(0.0, s);
  }
`
const pulseFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c) * 4.0;
    if (r > 1.0) discard;
    float a = exp(-r * 2.4) * vAlpha;
    gl_FragColor = vec4(vColor * a * 1.6, 1.0);
  }
`

/** The server that slides out of the target rack, with its board and data flows. */
export class Server {
  readonly group = new Group()
  readonly internals = new Group()
  readonly chassisMat = holoMaterial({ transparent: true, edgeWidth: 1.4, fill: new Color('#050d1f') })
  readonly componentMat = holoMaterial({ edgeWidth: 1.1, fill: new Color('#06122a'), glow: 0.8 })
  readonly gpuMat = holoMaterial({ edgeWidth: 1.6, fill: new Color('#0b2a5c'), edge: palette.ice, glow: 1.2 })
  readonly boardMat: ShaderMaterial
  readonly traceMat = new LineBasicMaterial({
    color: palette.cyan,
    transparent: true,
    opacity: 0.35,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  readonly pulseMat: ShaderMaterial
  readonly gpuCore: Mesh
  /** World position of the GPU die (updated every frame). */
  readonly gpuWorld = new Vector3()
  private gpuLocal = new Vector3(GPU.x, BOARD_Y + GPU.h + 0.002, GPU.z)

  constructor(pulseCount: number) {
    const chassis = new Mesh(new BoxGeometry(SERVER.w, SERVER.h, SERVER.d), this.chassisMat)
    chassis.renderOrder = 2
    this.group.add(chassis, this.internals)

    // Board
    this.boardMat = new ShaderMaterial({
      uniforms: { uVisible: { value: 0 }, uDeep: { value: palette.deep }, uCyan: { value: palette.cyan } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform vec3 uDeep; uniform vec3 uCyan;
        varying vec2 vUv;
        void main() {
          vec2 g = vUv * vec2(44.0, 70.0);
          vec2 fw = fwidth(g);
          vec2 l = abs(fract(g - 0.5) - 0.5) / max(fw, 1e-5);
          float line = 1.0 - min(min(l.x, l.y), 1.0);
          float vig = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          vec3 c = uDeep * 0.55 + uCyan * line * 0.05;
          gl_FragColor = vec4(c * vig * uVisible, 1.0);
        }
      `,
    })
    this.internals.scale.x = XS
    const board = new Mesh(new PlaneGeometry(0.43, SERVER.d - 0.01), this.boardMat)
    board.rotation.x = -Math.PI / 2
    board.position.y = BOARD_Y
    this.internals.add(board)

    const box = (w: number, h: number, d: number, x: number, z: number, mat = this.componentMat) => {
      const m = new Mesh(new BoxGeometry(w, h, d), mat)
      m.position.set(x, BOARD_Y + h / 2, z)
      this.internals.add(m)
      return m
    }
    // GPU module + glowing die.
    box(GPU.w, GPU.h, GPU.d, GPU.x, GPU.z)
    this.gpuCore = box(0.07, GPU.h + 0.003, 0.05, GPU.x, GPU.z, this.gpuMat)
    // CPUs with heat spreaders.
    for (const [x, z] of CPUS) {
      box(CPU_SIZE, 0.012, CPU_SIZE, x, z)
      box(CPU_SIZE * 0.6, 0.016, CPU_SIZE * 0.6, x, z)
    }
    // DIMMs
    for (let i = 0; i < 16; i++) box(0.006, 0.03, 0.1, -0.19 + (i * 0.38) / 15, -0.22)
    // Fan modules at the back (1U fans are flat boxes)
    for (let i = 0; i < 7; i++) box(0.05, 0.036, 0.04, -0.18 + i * 0.06, -0.31)
    // Front I/O ports
    for (let i = 0; i < 12; i++) box(0.018, 0.012, 0.02, -0.17 + (i * 0.34) / 11, 0.325)

    // Traces + pulses
    const traces = buildTraces()
    const y = BOARD_Y + 0.0006
    const seg: number[] = []
    for (const t of traces) {
      for (let s = 0; s < 3; s++) seg.push(t[s][0], y, t[s][1], t[s + 1][0], y, t[s + 1][1])
    }
    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(seg), 3))
    this.internals.add(new LineSegments(lineGeo, this.traceMat))

    const TAIL = 10
    const n = pulseCount * TAIL
    const attrs = ['aP0', 'aP1', 'aP2', 'aP3'].map(() => new Float32Array(n * 3))
    const seed = new Float32Array(n * 3)
    const lag = new Float32Array(n)
    for (let i = 0; i < pulseCount; i++) {
      const t = traces[Math.floor(Math.random() * traces.length)]
      const sx = Math.random()
      const sy = Math.random()
      const sz = Math.random()
      for (let j = 0; j < TAIL; j++) {
        const k = i * TAIL + j
        for (let q = 0; q < 4; q++) {
          attrs[q][k * 3] = t[q][0]
          attrs[q][k * 3 + 1] = y + 0.0012
          attrs[q][k * 3 + 2] = t[q][1]
        }
        seed[k * 3] = sx
        seed[k * 3 + 1] = sy
        seed[k * 3 + 2] = sz
        lag[k] = j
      }
    }
    const pg = new BufferGeometry()
    pg.setAttribute('position', new BufferAttribute(attrs[0], 3))
    attrs.forEach((a, q) => pg.setAttribute(`aP${q}`, new BufferAttribute(a, 3)))
    pg.setAttribute('aSeed', new BufferAttribute(seed, 3))
    pg.setAttribute('aLag', new BufferAttribute(lag, 1))
    this.pulseMat = new ShaderMaterial({
      vertexShader: pulseVertex,
      fragmentShader: pulseFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uSize: { value: 0.0032 },
        uVisible: { value: 0 },
        uSpeed: { value: 2.2 },
      },
    })
    const pulses = new Points(pg, this.pulseMat)
    pulses.frustumCulled = false
    this.internals.add(pulses)

    this.group.position.copy(SERVER_HOME)
  }

  /**
   * @param slide 0..1 how far the server is pulled out
   * @param lid 0..1 how transparent the chassis lid is
   * @param flows 0..1 visibility of data pulses
   * @param heat 0..1 GPU glow
   * @param dim 0..1 how far the board steps back (while the agent pipeline floats above it)
   */
  update(o: {
    visible: number
    slide: number
    lid: number
    flows: number
    heat: number
    dim?: number
    time: number
    scale: number
  }) {
    const v = o.visible
    this.group.visible = v > 0.001
    this.group.position.z = SERVER_HOME.z + o.slide * SERVER_SLIDE
    const fill = 1 - o.lid
    this.chassisMat.uniforms.uFillAlpha.value = fill * 0.95
    this.chassisMat.uniforms.uEdgeAlpha.value = 1 - o.lid * 0.55
    this.chassisMat.uniforms.uVisible.value = v
    this.chassisMat.depthWrite = fill > 0.9 && v > 0.98
    this.internals.visible = o.lid > 0.01
    const keep = 1 - 0.75 * (o.dim ?? 0)
    this.boardMat.uniforms.uVisible.value = o.lid * v * keep
    this.componentMat.uniforms.uVisible.value = o.lid * v * keep
    this.gpuMat.uniforms.uVisible.value = o.lid * v
    this.gpuMat.uniforms.uGlow.value = 1.2 + o.heat * 3
    this.gpuMat.uniforms.uFill.value.setRGB(0.04 + o.heat * 0.5, 0.16 + o.heat * 0.6, 0.36 + o.heat * 0.7)
    this.traceMat.opacity = 0.35 * o.lid * v * (0.6 + 0.4 * o.flows) * keep * keep
    this.pulseMat.uniforms.uVisible.value = o.flows * v
    this.pulseMat.uniforms.uTime.value = o.time
    this.pulseMat.uniforms.uScale.value = o.scale
    this.group.updateMatrixWorld()
    this.gpuWorld.copy(this.gpuLocal).applyMatrix4(this.group.matrixWorld)
  }
}
