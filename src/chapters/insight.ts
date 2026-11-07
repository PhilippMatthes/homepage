import {
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { classes, palette, type ClassId } from '../core/palette'
import { CLOUD_CENTER, CLOUD_EXTENT } from '../world/layout'

export interface CloudObject {
  cls: ClassId
  center: Vector3 // world
  size: Vector3
  label: string
  confidence: number
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

/**
 * A synthetic street scene as a LiDAR would see it: ground in concentric
 * rings around the sensor, cars, pedestrians, trees and facades sampled
 * on the surfaces facing the sensor. Coordinates are local (ground y = 0),
 * then shifted to CLOUD_CENTER.
 */
export function buildCloud(count: number) {
  const pos = new Float32Array(count * 3)
  const cls = new Float32Array(count)
  const objects: CloudObject[] = []
  const X = CLOUD_EXTENT.x
  const Z = CLOUD_EXTENT.z
  const sensor = new Vector3(0, 0.35, 0)

  // Scene objects (local coordinates)
  type Shape = { cls: ClassId; c: Vector3; s: Vector3; kind: 'car' | 'ped' | 'tree' | 'wall' }
  const shapes: Shape[] = []
  const cars: Array<[number, number]> = [
    [-3.1, -0.5], [-1.4, -0.52], [1.2, -0.48], [3.0, -0.5],
    [-2.3, 0.5], [0.4, 0.52], [2.4, 0.5],
  ]
  for (const [x, z] of cars) shapes.push({ cls: 1, kind: 'car', c: new Vector3(x, 0, z), s: new Vector3(rnd(0.85, 1.0), rnd(0.28, 0.34), 0.38) })
  for (const [x, z] of [[-2.7, 1.45], [-0.9, -1.5], [0.9, 1.55], [1.9, 1.4], [3.4, -1.5], [-3.6, -1.45]]) {
    shapes.push({ cls: 2, kind: 'ped', c: new Vector3(x, 0, z), s: new Vector3(0.12, rnd(0.33, 0.38), 0.12) })
  }
  for (const x of [-3.4, -1.8, -0.2, 1.5, 3.2]) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.25) continue
      shapes.push({ cls: 3, kind: 'tree', c: new Vector3(x + rnd(-0.2, 0.2), 0, side * 2.05), s: new Vector3(0.6, rnd(0.9, 1.15), 0.6) })
    }
  }
  for (const side of [-1, 1]) {
    shapes.push({ cls: 4, kind: 'wall', c: new Vector3(0, 0, side * (Z - 0.2)), s: new Vector3(2 * X, 1.2, 0.05) })
  }

  const budget = { ground: 0.36, car: 0.2, ped: 0.06, tree: 0.18, wall: 0.2 }
  const perKind = (k: Shape['kind']) => shapes.filter((s) => s.kind === k)
  const tmp = new Vector3()
  let n = 0
  const push = (p: Vector3, c: ClassId) => {
    if (n >= count) return
    pos[n * 3] = p.x + CLOUD_CENTER.x
    pos[n * 3 + 1] = p.y + CLOUD_CENTER.y
    pos[n * 3 + 2] = p.z + CLOUD_CENTER.z
    cls[n] = c
    n++
  }
  const facing = (p: Vector3, normal: Vector3) => tmp.copy(sensor).sub(p).dot(normal) > 0

  // Ground rings
  const nGround = Math.floor(count * budget.ground)
  const rings = 64
  for (let i = 0; i < nGround; i++) {
    const k = Math.floor(Math.pow(Math.random(), 0.8) * rings)
    const r = 0.22 * Math.pow(1.065, k) + gauss() * 0.004
    const a = Math.random() * Math.PI * 2
    const p = new Vector3(Math.cos(a) * r, gauss() * 0.006, Math.sin(a) * r)
    if (Math.abs(p.x) > X || Math.abs(p.z) > Z - 0.2) { i--; continue }
    const curb = Math.abs(p.z) > 1.15 ? 0.03 : 0
    p.y += curb
    push(p, 0)
  }

  // Sample a shape's sensor-facing surfaces.
  const sampleShape = (s: Shape, m: number) => {
    let tries = 0
    let made = 0
    while (made < m && tries++ < m * 12) {
      const p = new Vector3()
      const nrm = new Vector3()
      if (s.kind === 'car') {
        // body box + cabin box
        const cabin = Math.random() < 0.35
        const sx = cabin ? s.s.x * 0.55 : s.s.x
        const sy = cabin ? s.s.y * 0.6 : s.s.y * 0.6
        const y0 = cabin ? s.s.y * 0.6 : 0.04
        const face = Math.floor(Math.random() * 5)
        const u = Math.random() - 0.5
        const v = Math.random()
        if (face === 0) { p.set(u * sx, y0 + sy, (Math.random() - 0.5) * s.s.z); nrm.set(0, 1, 0) }
        else if (face === 1 || face === 2) { const sg = face === 1 ? 1 : -1; p.set(u * sx, y0 + v * sy, (sg * s.s.z) / 2); nrm.set(0, 0, sg) }
        else { const sg = face === 3 ? 1 : -1; p.set((sg * sx) / 2, y0 + v * sy, u * s.s.z); nrm.set(sg, 0, 0) }
        p.add(s.c)
      } else if (s.kind === 'ped') {
        const head = Math.random() < 0.18
        const a = Math.random() * Math.PI * 2
        if (head) {
          const r = 0.045
          const el = Math.acos(2 * Math.random() - 1)
          nrm.set(Math.sin(el) * Math.cos(a), Math.cos(el), Math.sin(el) * Math.sin(a))
          p.copy(nrm).multiplyScalar(r).add(new Vector3(0, s.s.y - r, 0))
        } else {
          const h = Math.random() * (s.s.y - 0.09)
          const r = h < 0.17 ? 0.03 : 0.05
          const legs = h < 0.17 ? (Math.random() < 0.5 ? -0.025 : 0.025) : 0
          nrm.set(Math.cos(a), 0, Math.sin(a))
          p.set(Math.cos(a) * r + legs, h, Math.sin(a) * r)
        }
        p.add(s.c)
      } else if (s.kind === 'tree') {
        const trunk = Math.random() < 0.15
        const a = Math.random() * Math.PI * 2
        if (trunk) {
          nrm.set(Math.cos(a), 0, Math.sin(a))
          p.set(Math.cos(a) * 0.04, Math.random() * s.s.y * 0.55, Math.sin(a) * 0.04)
        } else {
          const el = Math.acos(2 * Math.random() - 1)
          nrm.set(Math.sin(el) * Math.cos(a), Math.cos(el), Math.sin(el) * Math.sin(a))
          const r = s.s.x / 2 * (0.85 + 0.25 * Math.random())
          p.copy(nrm).multiplyScalar(r)
          p.y = p.y * 0.8 + s.s.y * 0.62
        }
        p.add(s.c)
      } else {
        // Facade with window grid gaps.
        const x = (Math.random() - 0.5) * s.s.x
        const y = Math.random() * s.s.y
        const wx = ((x + 10) / 0.42) % 1
        const wy = (y / 0.3) % 1
        if (y > 0.2 && wx > 0.25 && wx < 0.75 && wy > 0.3 && wy < 0.8) continue
        nrm.set(0, 0, -Math.sign(s.c.z))
        p.set(x, y, 0).add(s.c)
      }
      if (!facing(p, nrm)) continue
      p.x += gauss() * 0.004
      p.y += gauss() * 0.004
      p.z += gauss() * 0.004
      push(p, s.cls)
      made++
    }
  }
  for (const kind of ['car', 'ped', 'tree', 'wall'] as const) {
    const list = perKind(kind)
    const total = Math.floor(count * budget[kind])
    for (const s of list) sampleShape(s, Math.floor(total / list.length))
  }
  // Fill any remainder with ground.
  while (n < count) {
    const a = Math.random() * Math.PI * 2
    const r = rnd(0.3, X)
    const p = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * (Z / X))
    push(p, 0)
  }

  // Detected objects (for boxes and labels)
  const labels: Record<number, string> = { 1: 'vehicle', 2: 'pedestrian', 3: 'vegetation' }
  for (const s of shapes) {
    if (s.kind === 'wall') continue
    let size: Vector3
    let center: Vector3
    if (s.kind === 'car') { size = new Vector3(s.s.x + 0.04, s.s.y + 0.03, s.s.z + 0.04); center = s.c.clone().setY(size.y / 2) }
    else if (s.kind === 'ped') { size = new Vector3(0.16, s.s.y + 0.02, 0.16); center = s.c.clone().setY(size.y / 2) }
    else { size = new Vector3(s.s.x + 0.08, s.s.y * 1.05, s.s.z + 0.08); center = s.c.clone().setY((s.s.y * 1.05) / 2) }
    objects.push({
      cls: s.cls,
      center: center.add(CLOUD_CENTER),
      size,
      label: labels[s.cls],
      confidence: rnd(0.86, 0.99),
    })
  }
  return { pos, cls, objects }
}

/** Bounding boxes, the sweeping "model" plane and the holographic base. */
export class Insight {
  readonly group = new Group()
  readonly boxes: Array<{ obj: CloudObject; mesh: LineSegments; mat: LineBasicMaterial }> = []
  readonly sweepMat: ShaderMaterial
  readonly baseMat: ShaderMaterial
  readonly sweepPlane: Mesh

  constructor(readonly objects: CloudObject[]) {
    for (const obj of objects) {
      const mat = new LineBasicMaterial({
        color: classes[obj.cls].color.clone().lerp(palette.white, 0.35),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const g = new EdgesGeometry(new BoxGeometry(obj.size.x, obj.size.y, obj.size.z))
      const mesh = new LineSegments(g, mat)
      mesh.position.copy(obj.center)
      this.group.add(mesh)
      this.boxes.push({ obj, mesh, mat })
    }

    this.sweepMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: palette.ice }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float scan = 0.6 + 0.4 * sin(vUv.y * 120.0 - uTime * 8.0);
          float side = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          gl_FragColor = vec4(uColor * edge * side * scan * 0.22 * uOpacity, 1.0);
        }
      `,
    })
    this.sweepPlane = new Mesh(new PlaneGeometry(2 * CLOUD_EXTENT.z, 1.5), this.sweepMat)
    this.sweepPlane.rotation.y = Math.PI / 2
    this.sweepPlane.position.set(0, CLOUD_CENTER.y + 0.75, CLOUD_CENTER.z)
    this.group.add(this.sweepPlane)

    this.baseMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: palette.cyan }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor; uniform float uTime; varying vec2 vP;
        void main(){
          float r = length(vP);
          float rings = abs(fract(r * 2.5 - uTime * 0.15) - 0.5);
          float ring = 1.0 - smoothstep(0.0, fwidth(r * 2.5) * 1.5, rings);
          float rim = exp(-pow((r - 4.6) * 6.0, 2.0));
          float fade = 1.0 - smoothstep(3.6, 4.8, r);
          gl_FragColor = vec4(uColor * (ring * 0.12 * fade + rim * 0.5) * uOpacity, 1.0);
        }
      `,
    })
    const base = new Mesh(new PlaneGeometry(10, 10), this.baseMat)
    base.rotation.x = -Math.PI / 2
    base.position.copy(CLOUD_CENTER).setY(CLOUD_CENTER.y - 0.02)
    this.group.add(base)
  }

  /** Returns per-object reveal (0..1) for the HUD labels. */
  update(o: { visible: number; sweepX: number; sweepOn: number; time: number }): number[] {
    this.group.visible = o.visible > 0.001
    this.sweepMat.uniforms.uOpacity.value = o.sweepOn * o.visible
    this.sweepMat.uniforms.uTime.value = o.time
    this.sweepPlane.position.x = o.sweepX
    this.baseMat.uniforms.uOpacity.value = o.visible
    this.baseMat.uniforms.uTime.value = o.time
    return this.boxes.map(({ obj, mat }) => {
      const passed = Math.min(1, Math.max(0, (o.sweepX - (obj.center.x + obj.size.x / 2)) / 0.25))
      const r = passed * o.visible
      mat.opacity = r * 0.9
      return r
    })
  }
}
