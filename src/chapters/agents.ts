import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette, shade } from '../core/palette'
import { holoMaterial } from '../fx/holoMaterial'
import { smooth } from '../core/timeline'

/**
 * Agentic development & operations: a pipeline on a dark glass layer that
 * lifts off the open server board. One job at a time (a PR) runs along the
 * bus and docks at review → release → knowledge graph. While a card works it
 * fills its progress bar, writes log lines and calls inference on the GPU
 * below (request down in amber, response back up in ice).
 *
 * Server-local meters; the layer is horizontal, and +z (rack front) is
 * screen-down in the top-down camera.
 */

/** Height of the glass layer above the server center when fully lifted. */
const LAYER_Y = 0.12
const BOARD_Y = 0.006
const GPU_Z = 0.11
const CARD = { w: 0.06, d: 0.036, h: 0.003 }
const ROW_Z = -0.05
/** Top edge of the cards (screen-up side). */
const TOP_Z = ROW_Z - CARD.d / 2
/** The bus runs just below the cards; each card hangs off it through a port. */
const BUS_Z = ROW_Z + CARD.d / 2 + 0.008
const FRAME = { x0: -0.05, x1: 0.178, z0: TOP_Z - 0.016, z1: BUS_Z + 0.014 }
/** Where jobs come in from and leave to, just outside the frame. */
const IN_X = FRAME.x0 - 0.03
const OUT_X = FRAME.x1 + 0.03

export const STATIONS = [
  { name: 'review', x: -0.006 },
  { name: 'release', x: 0.064 },
  { name: 'knowledge graph', x: 0.134 },
] as const
/** World-space width a card's title may take. */
export const CARD_TITLE_W = CARD.w - 0.006

const JOBS = 2
const CYCLE = 10 // seconds per job
const DWELL = 0.16 // share of the cycle spent at each card
const BEAM_SEGS = 28
/** How long a card shows "done" before it goes back to idle. */
const DONE_HOLD = 1.6
const LOG_LINES = [0.036, 0.024, 0.03]

const AMBER = palette.amber
const ICE = palette.ice

const jobVertex = /* glsl */ `
  uniform float uSize;
  attribute float aGlow;
  attribute float aAlpha;
  varying float vGlow;
  varying float vAlpha;
  void main() {
    vGlow = aGlow;
    vAlpha = aAlpha;
    gl_PointSize = uSize * (1.0 + 0.25 * aGlow);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const jobFragment = /* glsl */ `
  uniform float uVisible;
  uniform vec3 uColor;
  varying float vGlow;
  varying float vAlpha;
  void main() {
    // A small horizontal capsule: reads as a ticket on the bus, not a particle.
    vec2 q = (gl_PointCoord - 0.5) * 2.0;
    float d = length(vec2(max(abs(q.x) - 0.42, 0.0), q.y)) - 0.36;
    float fw = fwidth(d);
    float body = 1.0 - smoothstep(-fw, fw, d);
    float halo = (1.0 - smoothstep(0.0, 0.45, d)) * 0.25;
    if (body + halo < 0.01) discard;
    vec3 c = uColor * (body * (1.0 + 0.6 * vGlow) + halo);
    gl_FragColor = vec4(c * vAlpha * uVisible, 1.0);
  }
`

type Hit = { card: number; prog: number }

interface CardParts {
  mat: ShaderMaterial
  dot: MeshBasicMaterial
  fill: Mesh
  fillMat: MeshBasicMaterial
  lines: MeshBasicMaterial[]
  /** Time the last job left this card (for the "done" state). */
  doneAt: number
  busy: boolean
}

export class Agents {
  readonly group = new Group()
  /** Label anchors (world space, updated every frame): top-left corner of each card. */
  readonly anchors = STATIONS.map(() => new Vector3())

  private layer = new Group()
  private glassMat = new MeshBasicMaterial({ color: palette.bg, transparent: true, opacity: 0, depthWrite: false })
  private frameMat = this.lineMat(palette.cyan)
  private busMat = this.lineMat(ICE)
  private flowMat = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  private flowGeo = new BufferGeometry()
  private flowPos: Float32Array
  private flowCol: Float32Array
  /** Header rules and progress tracks: constant, they only fade with the chapter. */
  private staticMats: MeshBasicMaterial[] = []
  private cards: CardParts[]
  private jobMat: ShaderMaterial
  private jobGeo = new BufferGeometry()
  private path: Array<{ p: Vector3; dwell: number }> = []
  private lengths: number[] = []
  private tmp = new Vector3()
  private tmpC = new Color()
  private tmpC2 = new Color()
  private hit: Hit = { card: -1, prog: 0 }
  /** Sideways shift of the pipeline (phones center it over the GPU); the GPU stays put. */
  private shift = 0

  private lineMat(color: Color) {
    return new LineBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
  }

  private flat(color: Color) {
    return new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })
  }

  /** A flat rectangle lying on the card top, given its left edge, top edge and size (meters). */
  private rect(x: number, z: number, w: number, d: number, mat: MeshBasicMaterial, fromLeft = false) {
    const geo = new PlaneGeometry(w, d)
    geo.rotateX(-Math.PI / 2)
    if (fromLeft) geo.translate(w / 2, 0, 0)
    const m = new Mesh(geo, mat)
    m.position.set(fromLeft ? x : x + w / 2, CARD.h + 0.0004, z + d / 2)
    m.renderOrder = 12
    return m
  }

  constructor() {
    const { x0, x1, z0, z1 } = FRAME
    // Dark glass under the pipeline: separates it from the busy board below.
    const glass = new Mesh(new PlaneGeometry(x1 - x0 + 0.03, z1 - z0 + 0.03), this.glassMat)
    glass.rotation.x = -Math.PI / 2
    glass.position.set((x0 + x1) / 2, -0.001, (z0 + z1) / 2)
    glass.renderOrder = 10

    // Frame: corner brackets only, blueprint style.
    const seg: number[] = []
    const push = (ax: number, az: number, bx: number, bz: number) => seg.push(ax, 0, az, bx, 0, bz)
    const c = 0.014
    for (const [x, sx] of [[x0, 1], [x1, -1]] as const) {
      for (const [z, sz] of [[z0, 1], [z1, -1]] as const) {
        push(x, z, x + sx * c, z)
        push(x, z, x, z + sz * c)
      }
    }
    const frame = new LineSegments(
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(seg), 3)),
      this.frameMat,
    )

    // Bus with chevrons pointing downstream, between the ports.
    const bus: number[] = [IN_X, 0, BUS_Z, OUT_X, 0, BUS_Z]
    const xs = [x0, ...STATIONS.map((s) => s.x), x1]
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      bus.push(cx - 0.003, 0, BUS_Z - 0.003, cx + 0.001, 0, BUS_Z, cx + 0.001, 0, BUS_Z, cx - 0.003, 0, BUS_Z + 0.003)
    }
    const busLines = new LineSegments(
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(bus), 3)),
      this.busMat,
    )

    // Cards with a header rule, status dot, log lines and a progress bar.
    const ruleMat = this.flat(ICE)
    const trackMat = this.flat(palette.deep)
    this.staticMats.push(ruleMat, trackMat)
    const pad = 0.005
    const cardMeshes: Mesh[] = []
    this.cards = STATIONS.map((s) => {
      const mat = holoMaterial({ transparent: true, fill: shade(palette.deep, 0.82), edge: ICE, edgeWidth: 1.4, glow: 1 })
      const box = new Mesh(new BoxGeometry(CARD.w, CARD.h, CARD.d), mat)
      box.position.set(s.x, CARD.h / 2, ROW_Z)
      box.renderOrder = 11
      const left = s.x - CARD.w / 2 + pad
      const inner = CARD.w - 2 * pad

      const dotMat = this.flat(ICE)
      const dot = new Mesh(new CircleGeometry(0.0022, 20).rotateX(-Math.PI / 2), dotMat)
      dot.position.set(s.x + CARD.w / 2 - 0.0075, CARD.h + 0.0004, TOP_Z + 0.019)
      dot.renderOrder = 12

      const rule = this.rect(left, TOP_Z + 0.0135, inner, 0.0008, ruleMat)
      const lines = LOG_LINES.map(() => this.flat(ICE))
      const lineMeshes = LOG_LINES.map((w, k) => this.rect(left, TOP_Z + 0.0172 + k * 0.0045, w, 0.0016, lines[k]))
      const track = this.rect(left, TOP_Z + 0.0305, inner, 0.0018, trackMat)
      const fillMat = this.flat(AMBER)
      const fill = this.rect(left, TOP_Z + 0.0305, inner, 0.0018, fillMat, true)
      fill.position.y += 0.0002

      cardMeshes.push(box, dot, rule, ...lineMeshes, track, fill)
      return { mat, dot: dotMat, fill, fillMat, lines, doneAt: -1e9, busy: false }
    })

    // Per card: a port stub up from the bus, and the inference beam down to the GPU (vertex-colored, set per frame).
    const verts = STATIONS.length * (1 + BEAM_SEGS) * 2
    this.flowPos = new Float32Array(verts * 3)
    this.flowCol = new Float32Array(verts * 3)
    this.flowGeo.setAttribute('position', new BufferAttribute(this.flowPos, 3))
    this.flowGeo.setAttribute('color', new BufferAttribute(this.flowCol, 3))
    const flow = new LineSegments(this.flowGeo, this.flowMat)
    flow.frustumCulled = false

    for (const o of [frame, busLines]) o.renderOrder = 11
    flow.renderOrder = 11
    this.layer.add(glass, frame, busLines, ...cardMeshes)

    // Jobs: positions are computed on the CPU (there are only a couple).
    this.jobGeo.setAttribute('position', new BufferAttribute(new Float32Array(JOBS * 3), 3))
    this.jobGeo.setAttribute('aGlow', new BufferAttribute(new Float32Array(JOBS), 1))
    this.jobGeo.setAttribute('aAlpha', new BufferAttribute(new Float32Array(JOBS), 1))
    this.jobMat = new ShaderMaterial({
      vertexShader: jobVertex,
      fragmentShader: jobFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: { uVisible: { value: 0 }, uSize: { value: 10 }, uColor: { value: palette.spark } },
    })
    const jobs = new Points(this.jobGeo, this.jobMat)
    jobs.frustumCulled = false
    jobs.renderOrder = 13

    this.group.add(this.layer, flow, jobs)
  }

  private buildPath(y: number) {
    const at = (x: number) => new Vector3(x, y, BUS_Z)
    this.path = [{ p: at(IN_X), dwell: 0 }, ...STATIONS.map((s) => ({ p: at(s.x), dwell: DWELL })), { p: at(OUT_X), dwell: 0 }]
    this.lengths = this.path.slice(1).map((w, i) => w.p.distanceTo(this.path[i].p))
  }

  /** Position along the route for cycle phase t ∈ [0, 1); sets this.hit to the card it docks at, if any. */
  private sample(t: number, out: Vector3) {
    const travel = 1 - DWELL * STATIONS.length
    const total = this.lengths.reduce((a, b) => a + b, 0)
    this.hit.card = -1
    let rest = t
    for (let i = 0; i < this.lengths.length; i++) {
      const segT = (this.lengths[i] / total) * travel
      if (rest < segT) {
        out.lerpVectors(this.path[i].p, this.path[i + 1].p, smooth(rest / segT))
        return
      }
      rest -= segT
      const dwell = this.path[i + 1].dwell
      if (rest < dwell) {
        out.copy(this.path[i + 1].p)
        this.hit.card = i
        this.hit.prog = rest / dwell
        return
      }
      rest -= dwell
    }
    out.copy(this.path[this.path.length - 1].p)
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
      this.anchors[i].set(s.x - CARD.w / 2 + 0.005, y + CARD.h, TOP_Z + 0.0075).add(this.group.position),
    )
    if (!this.group.visible) return

    const v = o.visible
    const t = o.time
    this.glassMat.opacity = 0.9 * v
    this.frameMat.opacity = 0.6 * v
    this.busMat.opacity = 0.4 * v
    this.flowMat.opacity = v

    // Jobs along the bus; at most one per card.
    this.buildPath(y)
    const pos = this.jobGeo.attributes.position as BufferAttribute
    const glow = this.jobGeo.attributes.aGlow as BufferAttribute
    const alpha = this.jobGeo.attributes.aAlpha as BufferAttribute
    const prog = STATIONS.map(() => -1)
    for (let j = 0; j < JOBS; j++) {
      this.sample((t / CYCLE + j / JOBS) % 1, this.tmp)
      pos.setXYZ(j, this.tmp.x, this.tmp.y, this.tmp.z)
      if (this.hit.card >= 0) prog[this.hit.card] = this.hit.prog
      glow.setX(j, this.hit.card >= 0 ? 1 : 0)
      // Fade in and out beyond the frame.
      const out = Math.max(FRAME.x0 - this.tmp.x, this.tmp.x - FRAME.x1, 0)
      alpha.setX(j, 1 - smooth(Math.min(1, out / 0.028)))
    }
    pos.needsUpdate = true
    glow.needsUpdate = true
    alpha.needsUpdate = true

    // Cards: running (amber, filling), done (ice, full), idle (quiet).
    for (const m of this.staticMats) m.opacity = 0.35 * v
    let fi = 0
    const setFlow = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, ca: Color, cb: Color) => {
      this.flowPos.set([ax, ay, az, bx, by, bz], fi * 6)
      this.flowCol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], fi * 6)
      fi++
    }
    const col = (base: Color, k: number, out = this.tmpC) => out.copy(base).multiplyScalar(k)
    const gpuX = -this.shift
    this.cards.forEach((card, i) => {
      const s = STATIONS[i]
      const running = prog[i] >= 0
      if (card.busy && !running) card.doneAt = t
      card.busy = running
      const done = running ? 0 : 1 - smooth(Math.min(1, Math.max(0, (t - card.doneAt - DONE_HOLD * 0.6) / (DONE_HOLD * 0.4))))
      const p = running ? prog[i] : done > 0 ? 1 : 0

      card.mat.uniforms.uVisible.value = v
      card.mat.uniforms.uTime.value = t
      card.mat.uniforms.uGlow.value = 0.85 + (running ? 1.4 : done * 0.6)

      card.fill.scale.x = Math.max(0.001, p)
      card.fillMat.color.copy(running ? AMBER : ICE)
      card.fillMat.opacity = (running ? 0.95 : 0.7 * done) * v
      card.lines.forEach((m, k) => {
        const shown = running ? smooth(Math.min(1, Math.max(0, (prog[i] * 3.2 - k) * 2))) : done
        m.opacity = (0.12 + 0.55 * shown) * v
      })
      const pulse = 0.5 + 0.5 * Math.sin(t * 9)
      card.dot.color.copy(running ? AMBER : ICE)
      card.dot.opacity = (running ? 0.6 + 0.4 * pulse : 0.3 + 0.6 * done) * v

      // Port stub from the bus up to the card.
      const stub = running ? 0.9 : 0.25
      setFlow(s.x, y, BUS_Z, s.x, y, ROW_Z + CARD.d / 2, col(ICE, stub), col(ICE, stub))

      // Inference beam from the card down to the GPU, with a request/response pulse while running.
      const ax = s.x + CARD.w / 2 - 0.012
      const az = ROW_Z + CARD.d / 2 - 0.004
      const bx = gpuX + (i - 1) * 0.022
      const f = running ? (prog[i] * 3) % 1 : -1
      const head = f < 0 ? -1 : f < 0.5 ? f * 2 : 2 - f * 2
      const tint = f < 0.5 ? AMBER : ICE
      const base = running ? 0.22 : 0.05 + 0.08 * done
      for (let k = 0; k < BEAM_SEGS; k++) {
        const u0 = k / BEAM_SEGS
        const u1 = (k + 1) / BEAM_SEGS
        const g0 = head < 0 ? 0 : Math.exp(-(((u0 - head) / 0.07) ** 2))
        const g1 = head < 0 ? 0 : Math.exp(-(((u1 - head) / 0.07) ** 2))
        const c0 = col(ICE, base, this.tmpC).lerp(tint, g0).multiplyScalar(1 + 1.5 * g0)
        const c1 = col(ICE, base, this.tmpC2).lerp(tint, g1).multiplyScalar(1 + 1.5 * g1)
        setFlow(
          ax + (bx - ax) * u0, y + (BOARD_Y - y) * u0, az + (GPU_Z - az) * u0,
          ax + (bx - ax) * u1, y + (BOARD_Y - y) * u1, az + (GPU_Z - az) * u1,
          c0, c1,
        )
      }
    })
    ;(this.flowGeo.attributes.position as BufferAttribute).needsUpdate = true
    ;(this.flowGeo.attributes.color as BufferAttribute).needsUpdate = true

    this.jobMat.uniforms.uVisible.value = v
    this.jobMat.uniforms.uSize.value = 11 * o.dpr
  }
}
