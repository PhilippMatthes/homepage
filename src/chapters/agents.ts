import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette } from '../core/palette'
import { holoMaterial } from '../fx/holoMaterial'
import { smooth } from '../core/timeline'

/**
 * Agentic development & operations: a clean pipeline on a dark glass layer
 * that lifts off the open server board. Agents rise from the GPU, enter the
 * Envoy sandbox through a gate, stop at review → release → knowledge graph
 * (each card lights up while it works) and leave through the proxy.
 *
 * Server-local meters; the layer is horizontal, and +z (rack front) is
 * screen-down in the top-down camera.
 */

/** Height of the glass layer above the server center when fully lifted. */
const LAYER_Y = 0.12
const BOARD_Y = 0.006
// Centered a little right of the GPU, where the top-down camera frames the board.
const SANDBOX = { x0: -0.036, x1: 0.164, z0: -0.1, z1: 0.02 }
const CARD = { w: 0.05, d: 0.03, h: 0.003 }
const ROW_Z = -0.04

export const STATIONS = [
  { name: 'review', x: 0.002 },
  { name: 'release', x: 0.064 },
  { name: 'knowledge graph', x: 0.126 },
] as const

/** Gates in the sandbox outline: where agents enter and where the proxy lets them out. */
const ENTRY = { x: 0.002, z: SANDBOX.z1 }
const PROXY = { x: 0.126, z: SANDBOX.z0 }

const AGENTS = 10
const CYCLE = 9 // seconds per round trip
const DWELL = 0.11 // share of the cycle spent at each card

const agentVertex = /* glsl */ `
  uniform float uSize;
  attribute float aGlow;
  attribute vec3 aColor;
  varying float vGlow;
  varying vec3 vColor;
  void main() {
    vGlow = aGlow;
    vColor = aColor;
    gl_PointSize = uSize * (1.0 + 0.8 * aGlow);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const agentFragment = /* glsl */ `
  uniform float uVisible;
  varying float vGlow;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    // A crisp core with a thin halo: reads as a distinct agent, not a blob.
    float core = smoothstep(0.55, 0.4, r);
    float halo = (1.0 - r) * 0.35;
    gl_FragColor = vec4(vColor * (core + halo) * (1.0 + vGlow) * uVisible, 1.0);
  }
`

type Waypoint = { p: Vector3; dwell: number }
/** Waypoint index of the first card in the route. */
const FIRST_CARD = 3

export class Agents {
  readonly group = new Group()
  /** Label anchors (world space, updated every frame): top-left corner of each card, then the sandbox. */
  readonly anchors = STATIONS.map(() => new Vector3())
  readonly sandboxAnchor = new Vector3()

  private layer = new Group()
  private glassMat = new MeshBasicMaterial({ color: palette.bg, transparent: true, opacity: 0, depthWrite: false })
  private outlineMat = this.lineMat(palette.cyan)
  private gateMat = this.lineMat(new Color('#ffd08a'))
  private wireMat = this.lineMat(palette.ice)
  private riseMat = this.lineMat(palette.ice)
  private cardMats = STATIONS.map(() =>
    holoMaterial({ transparent: true, fill: new Color('#071633'), edge: palette.ice, edgeWidth: 1.4, glow: 1 }),
  )
  private agentMat: ShaderMaterial
  private agentGeo = new BufferGeometry()
  private rise: Line
  private path: Waypoint[] = []
  private lengths: number[] = []
  private tmp = new Vector3()
  /** Sideways shift of the pipeline (phones center it over the GPU); the GPU end stays put. */
  private shift = 0

  private lineMat(color: Color) {
    return new LineBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
  }

  constructor() {
    // Dark glass under the sandbox: separates the pipeline from the busy board below.
    const glass = new Mesh(new PlaneGeometry(SANDBOX.x1 - SANDBOX.x0 + 0.05, SANDBOX.z1 - SANDBOX.z0 + 0.05), this.glassMat)
    glass.rotation.x = -Math.PI / 2
    glass.position.set((SANDBOX.x0 + SANDBOX.x1) / 2, -0.001, (SANDBOX.z0 + SANDBOX.z1) / 2)
    glass.renderOrder = 10

    // Sandbox outline with gaps for the two gates; the gates themselves are drawn warm.
    const { x0, x1, z0, z1 } = SANDBOX
    const gap = 0.012
    const seg: number[] = []
    const push = (ax: number, az: number, bx: number, bz: number) => seg.push(ax, 0, az, bx, 0, bz)
    push(x0, z0, PROXY.x - gap, z0)
    push(PROXY.x + gap, z0, x1, z0)
    push(x1, z0, x1, z1)
    push(x1, z1, ENTRY.x + gap, z1)
    push(ENTRY.x - gap, z1, x0, z1)
    push(x0, z1, x0, z0)
    const outline = new LineSegments(
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(seg), 3)),
      this.outlineMat,
    )
    const gates: number[] = []
    for (const g of [ENTRY, PROXY]) {
      gates.push(g.x - gap, 0, g.z - 0.004, g.x - gap, 0, g.z + 0.004, g.x + gap, 0, g.z - 0.004, g.x + gap, 0, g.z + 0.004)
    }
    const gateLines = new LineSegments(
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(gates), 3)),
      this.gateMat,
    )

    // Station cards.
    const cards = STATIONS.map((s, i) => {
      const m = new Mesh(new BoxGeometry(CARD.w, CARD.h, CARD.d), this.cardMats[i])
      m.position.set(s.x, CARD.h / 2, ROW_Z)
      m.renderOrder = 11
      return m
    })

    // The route on the layer: gate → cards → proxy → out.
    const wire = new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(ENTRY.x, 0, ENTRY.z),
        ...STATIONS.map((s) => new Vector3(s.x, 0, ROW_Z)),
        new Vector3(PROXY.x, 0, PROXY.z),
        new Vector3(PROXY.x, 0, SANDBOX.z0 - 0.06),
      ]),
      this.wireMat,
    )

    // The rise from the GPU up to the entry gate, updated as the layer lifts.
    this.rise = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), this.riseMat)
    this.rise.frustumCulled = false

    for (const o of [outline, gateLines, wire, this.rise]) o.renderOrder = 11
    this.layer.add(glass, outline, gateLines, wire, ...cards)

    // Agents: positions are computed on the CPU (there are only a few).
    this.agentGeo.setAttribute('position', new BufferAttribute(new Float32Array(AGENTS * 3), 3))
    this.agentGeo.setAttribute('aGlow', new BufferAttribute(new Float32Array(AGENTS), 1))
    const colors = new Float32Array(AGENTS * 3)
    const tints = [palette.ice, palette.ice, palette.cyan, new Color('#b4a6ff'), new Color('#7cf5cf')]
    for (let i = 0; i < AGENTS; i++) tints[i % tints.length].toArray(colors, i * 3)
    this.agentGeo.setAttribute('aColor', new BufferAttribute(colors, 3))
    this.agentMat = new ShaderMaterial({
      vertexShader: agentVertex,
      fragmentShader: agentFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: { uVisible: { value: 0 }, uSize: { value: 6 } },
    })
    const agents = new Points(this.agentGeo, this.agentMat)
    agents.frustumCulled = false
    agents.renderOrder = 12

    this.group.add(this.layer, this.rise, agents)
  }

  private buildPath(y: number) {
    const at = (x: number, z: number, yy = y) => new Vector3(x, yy, z)
    this.path = [
      { p: at(-this.shift, 0.11, BOARD_Y), dwell: 0 }, // GPU
      { p: at(ENTRY.x, ENTRY.z + 0.03, y * 0.6), dwell: 0 },
      { p: at(ENTRY.x, ENTRY.z), dwell: 0 },
      ...STATIONS.map((s) => ({ p: at(s.x, ROW_Z), dwell: DWELL })),
      { p: at(PROXY.x, PROXY.z), dwell: 0 },
      { p: at(PROXY.x, SANDBOX.z0 - 0.06), dwell: 0 },
    ]
    this.lengths = this.path.slice(1).map((w, i) => w.p.distanceTo(this.path[i].p))
  }

  /** Position along the route for cycle phase t ∈ [0, 1); returns the card it works at, or -1. */
  private sample(t: number, out: Vector3) {
    const travel = 1 - DWELL * STATIONS.length
    const total = this.lengths.reduce((a, b) => a + b, 0)
    let rest = t
    for (let i = 0; i < this.lengths.length; i++) {
      const segT = (this.lengths[i] / total) * travel
      if (rest < segT) {
        out.lerpVectors(this.path[i].p, this.path[i + 1].p, smooth(rest / segT))
        return -1
      }
      rest -= segT
      const dwell = this.path[i + 1].dwell
      if (rest < dwell) {
        out.copy(this.path[i + 1].p)
        return i + 1 - FIRST_CARD
      }
      rest -= dwell
    }
    out.copy(this.path[this.path.length - 1].p)
    return -1
  }

  update(o: { visible: number; time: number; origin: Vector3; dpr: number; shift: number }) {
    this.group.visible = o.visible > 0.001
    this.shift = o.shift
    this.group.position.copy(o.origin)
    this.group.position.x += o.shift
    // The layer lifts off the board as the chapter fades in.
    const y = LAYER_Y * (0.35 + 0.65 * smooth(o.visible))
    this.layer.position.y = y
    STATIONS.forEach((s, i) =>
      this.anchors[i].set(s.x - CARD.w / 2 + 0.005, y + CARD.h, ROW_Z - CARD.d / 2 + 0.008).add(this.group.position),
    )
    // Inside the bottom-right corner, clear of the screen edge and the chapter rail.
    this.sandboxAnchor.set(SANDBOX.x1 - 0.05, y, SANDBOX.z1 - 0.009).add(this.group.position)
    if (!this.group.visible) return

    const v = o.visible
    this.glassMat.opacity = 0.9 * v
    this.outlineMat.opacity = 0.75 * v
    this.wireMat.opacity = 0.35 * v
    this.riseMat.opacity = 0.3 * v

    this.buildPath(y)
    const rise = this.rise.geometry.attributes.position as BufferAttribute
    rise.setXYZ(0, -this.shift, BOARD_Y, 0.11)
    rise.setXYZ(1, ENTRY.x, y, ENTRY.z)
    rise.needsUpdate = true

    const pos = this.agentGeo.attributes.position as BufferAttribute
    const glow = this.agentGeo.attributes.aGlow as BufferAttribute
    const busy = STATIONS.map(() => 0)
    let gates = 0
    for (let i = 0; i < AGENTS; i++) {
      const card = this.sample((o.time / CYCLE + i / AGENTS) % 1, this.tmp)
      pos.setXYZ(i, this.tmp.x, this.tmp.y, this.tmp.z)
      if (card >= 0) busy[card]++
      // Flash when passing a gate.
      const dGate = Math.min(
        Math.hypot(this.tmp.x - ENTRY.x, this.tmp.z - ENTRY.z),
        Math.hypot(this.tmp.x - PROXY.x, this.tmp.z - PROXY.z),
      )
      const g = Math.exp(-((dGate / 0.012) ** 2))
      gates = Math.max(gates, g)
      glow.setX(i, g + (card >= 0 ? 0.4 : 0))
    }
    pos.needsUpdate = true
    glow.needsUpdate = true
    this.gateMat.opacity = (0.45 + 0.55 * gates) * v

    this.cardMats.forEach((m, i) => {
      m.uniforms.uVisible.value = v
      m.uniforms.uTime.value = o.time
      // Cards light up while agents work on them.
      m.uniforms.uGlow.value = 0.9 + Math.min(1, busy[i]) * 1.6
    })
    this.agentMat.uniforms.uVisible.value = v
    this.agentMat.uniforms.uSize.value = 7 * o.dpr
  }
}
