import { Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import { palette } from '../core/palette'

/**
 * Perses-style observability dashboards floating in the aisle in front of
 * the target rack. The panel *contents* are drawn by the shared particles
 * (stage 3); this module provides their layout and the glass panel frames.
 */

export const DASH = {
  /** Floats above the racks (2 m) and cable trays (2.45 m) so nothing cuts through it. */
  center: new Vector3(0, 3.35, 6.25),
  cols: 3,
  rows: 2,
  w: 1.12,
  h: 0.64,
  gap: 0.14,
  /** Plot area inside a panel, relative to the panel's bottom-left corner. */
  inner: { x: 0.06, y: 0.07, w: 1.0, h: 0.44 },
}

/** 0 time series, 1 bars, 2 node graph, 3 heatmap */
export const PANELS: Array<{ type: number; title: string }> = [
  { type: 0, title: 'vm placements / s' },
  { type: 2, title: 'cluster topology' },
  { type: 1, title: 'hypervisor util' },
  { type: 3, title: 'scheduler latency' },
  { type: 0, title: 'memory committed' },
  { type: 1, title: 'reservations by az' },
]

export function panelOrigin(i: number, out = new Vector3()) {
  const col = i % DASH.cols
  const row = Math.floor(i / DASH.cols)
  const totalW = DASH.cols * DASH.w + (DASH.cols - 1) * DASH.gap
  const totalH = DASH.rows * DASH.h + (DASH.rows - 1) * DASH.gap
  return out.set(
    DASH.center.x - totalW / 2 + col * (DASH.w + DASH.gap),
    DASH.center.y + totalH / 2 - (row + 1) * DASH.h - row * DASH.gap,
    DASH.center.z,
  )
}

/**
 * Per particle: aDash = (plot left x, plot bottom y, z),
 * aDashInfo = (type, u, v, element seed).
 */
export function dashTargets(count: number) {
  const base = new Float32Array(count * 3)
  const info = new Float32Array(count * 4)
  const o = new Vector3()
  for (let i = 0; i < count; i++) {
    const p = i % PANELS.length
    panelOrigin(p, o)
    base[i * 3] = o.x + DASH.inner.x
    base[i * 3 + 1] = o.y + DASH.inner.y
    base[i * 3 + 2] = o.z + 0.01
    info[i * 4] = PANELS[p].type
    info[i * 4 + 1] = Math.random()
    info[i * 4 + 2] = Math.random()
    info[i * 4 + 3] = Math.random()
  }
  return { base, info }
}

/** Glass panels with a thin border and a header strip. */
export class Dashboard {
  readonly group = new Group()
  private mat: ShaderMaterial
  readonly titleAnchors: Vector3[] = []

  constructor() {
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uVisible: { value: 0 }, uEdge: { value: palette.cyan }, uAspect: { value: DASH.w / DASH.h } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform vec3 uEdge; uniform float uAspect; varying vec2 vUv;
        void main() {
          vec2 d = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
          float e = min(d.x, d.y);
          float fw = fwidth(e);
          float border = 1.0 - smoothstep(0.0, fw * 1.5, e);
          float header = step(0.86, vUv.y) * 0.06;
          vec3 col = vec3(0.02, 0.05, 0.12) + uEdge * (border * 0.55 + header);
          float a = (0.55 + border * 0.45) * uVisible;
          gl_FragColor = vec4(col, a);
        }
      `,
    })
    const geo = new PlaneGeometry(DASH.w, DASH.h)
    const o = new Vector3()
    PANELS.forEach((_, i) => {
      panelOrigin(i, o)
      const m = new Mesh(geo, this.mat)
      m.position.set(o.x + DASH.w / 2, o.y + DASH.h / 2, o.z - 0.005)
      m.renderOrder = -1
      this.group.add(m)
      this.titleAnchors.push(new Vector3(o.x + 0.06, o.y + DASH.h - 0.03, o.z))
    })
  }

  update(visible: number) {
    this.group.visible = visible > 0.001
    this.mat.uniforms.uVisible.value = visible
  }
}
