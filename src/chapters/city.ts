import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector2, Vector3 } from 'three'
import { shared } from '../core/shared'
import { CITY_CENTER, CITY_RADIUS } from '../world/layout'

interface Seg {
  a: Vector2
  b: Vector2
  /** 0 local street … 1 arterial; negative = river */
  w: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Elbe-like river south of the center (z grows to the south). */
const riverZ = (x: number) => 40 + 9 * Math.sin(x / 38) + 4 * Math.sin(x / 13 + 1)
const inRiver = (p: Vector2) => Math.abs(p.y - riverZ(p.x)) < 7

const RINGS = [18, 42, 76, 112]
const RADIALS = 11

function ringPoint(r: number, a: number, i: number) {
  const rr = r * (1 + 0.07 * Math.sin(3 * a + i) + 0.03 * Math.sin(7 * a + 2 * i))
  return new Vector2(Math.cos(a) * rr, Math.sin(a) * rr)
}
function radialAngle(k: number, r: number) {
  return (k / RADIALS) * Math.PI * 2 + 0.2 * Math.sin(k * 1.7) + 0.18 * Math.sin(r / 38 + k)
}

/**
 * A procedural, Hamburg-flavoured road network: ring roads, radial
 * arterials, district street grids and a river. Returns segments in
 * city-local x/z.
 */
function buildNetwork() {
  const segs: Seg[] = []
  RINGS.forEach((r, i) => {
    const n = Math.round(r * 0.55) + 12
    for (let j = 0; j < n; j++) {
      const a0 = (j / n) * Math.PI * 2
      const a1 = ((j + 1) / n) * Math.PI * 2
      const a = ringPoint(r, a0, i)
      const b = ringPoint(r, a1, i)
      if (inRiver(a) && inRiver(b)) continue
      segs.push({ a, b, w: i === 2 ? 1 : 0.85 })
    }
  })
  for (let k = 0; k < RADIALS; k++) {
    const steps = 30
    for (let j = 0; j < steps; j++) {
      const r0 = 6 + (j / steps) * (CITY_RADIUS - 6)
      const r1 = 6 + ((j + 1) / steps) * (CITY_RADIUS - 6)
      const a0 = radialAngle(k, r0)
      const a1 = radialAngle(k, r1)
      segs.push({
        a: new Vector2(Math.cos(a0) * r0, Math.sin(a0) * r0),
        b: new Vector2(Math.cos(a1) * r1, Math.sin(a1) * r1),
        w: 0.95,
      })
    }
  }
  // District grids: each 36 m block of the map gets its own street orientation.
  const S = 7.5
  for (let gx = -CITY_RADIUS; gx < CITY_RADIUS; gx += S) {
    for (let gz = -CITY_RADIUS; gz < CITY_RADIUS; gz += S) {
      const block = Math.floor(gx / 36) * 31 + Math.floor(gz / 36) * 17
      const rot = Math.sin(block) * 0.6
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const p = new Vector2(gx + rand(-1, 1), gz + rand(-1, 1))
      const r = p.length()
      if (r > CITY_RADIUS) continue
      // Denser in the center, thinning towards the outskirts.
      if (Math.random() > 1 - 0.75 * (r / CITY_RADIUS)) continue
      for (const [dx, dz] of [[S, 0], [0, S]]) {
        if (Math.random() < 0.3) continue
        const q = new Vector2(p.x + dx * c - dz * s, p.y + dx * s + dz * c)
        if (inRiver(p) || inRiver(q) || q.length() > CITY_RADIUS) continue
        segs.push({ a: p, b: q, w: 0.15 + Math.random() * 0.15 })
      }
    }
  }
  // River banks as dim dotted bands.
  for (let x = -CITY_RADIUS; x < CITY_RADIUS; x += 6) {
    for (const side of [-1, 1]) {
      const a = new Vector2(x, riverZ(x) + side * 7)
      const b = new Vector2(x + 6, riverZ(x + 6) + side * 7)
      if (a.length() < CITY_RADIUS) segs.push({ a, b, w: -1 })
    }
  }
  return segs
}

/** The green-wave bike route: in along a radial, then around the inner ring. */
function buildRoute() {
  const pts: Vector2[] = []
  const k = 8
  for (let r = 104; r >= 18; r -= 2) {
    const a = radialAngle(k, r)
    pts.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r))
  }
  const aStart = radialAngle(k, 18)
  for (let j = 1; j <= 30; j++) pts.push(ringPoint(18, aStart + (j / 30) * 1.7, 0))
  return pts
}

/** Positions on the road network for the shared particles. */
export function cityTargets(count: number) {
  const segs = buildNetwork()
  const pos = new Float32Array(count * 3)
  const flow = new Float32Array(count * 3)
  const weight = new Float32Array(count)
  // Pick segments proportional to length × importance.
  const cum: number[] = []
  let total = 0
  for (const s of segs) {
    total += s.a.distanceTo(s.b) * (s.w < 0 ? 0.5 : 1 + 1.3 * s.w)
    cum.push(total)
  }
  const y = CITY_CENTER.y + 0.05
  for (let i = 0; i < count; i++) {
    const target = Math.random() * total
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < target) lo = mid + 1
      else hi = mid
    }
    const s = segs[lo]
    const t = Math.random()
    const dx = s.b.x - s.a.x
    const dz = s.b.y - s.a.y
    const len = Math.hypot(dx, dz) || 1
    // Lanes: a little lateral spread on big roads.
    const lateral = (Math.random() - 0.5) * (s.w > 0.8 ? 0.9 : 0.35)
    const o = i * 3
    pos[o] = CITY_CENTER.x + s.a.x + dx * t - (dz / len) * lateral
    pos[o + 1] = y
    pos[o + 2] = CITY_CENTER.z + s.a.y + dz * t + (dx / len) * lateral
    weight[i] = s.w < 0 ? 0.12 : s.w
    // Moving traffic on major roads.
    if (s.w > 0.8 && Math.random() < 0.22) {
      pos[o] = CITY_CENTER.x + s.a.x - (dz / len) * lateral
      pos[o + 2] = CITY_CENTER.z + s.a.y + (dx / len) * lateral
      const dir = Math.random() < 0.5 ? 1 : -1
      if (dir < 0) {
        pos[o] += dx
        pos[o + 2] += dz
      }
      flow[o] = dx * dir
      flow[o + 2] = dz * dir
    }
  }
  return { pos, flow, weight }
}

const lightVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uVisible;
  uniform float uWave;
  uniform float uFogDensity;
  attribute vec2 aInfo; // x: phase, y: route position (−1 = not on the route)
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    float green;
    if (aInfo.y < 0.0) {
      green = step(0.5, fract(uTime * 0.12 + aInfo.x));
    } else {
      float d = aInfo.y - uWave;
      green = step(-0.03, d) * step(d, 0.16);
    }
    vec3 red = vec3(1.0, 0.25, 0.3);
    vec3 grn = vec3(0.3, 1.0, 0.55);
    float onRoute = step(0.0, aInfo.y);
    vColor = mix(red, grn, green) * mix(0.55, 1.4, onRoute) * uVisible * exp(-pow(uFogDensity * dist, 2.0));
    gl_PointSize = clamp(mix(1.3, 2.2, onRoute) * uScale / dist, 1.5, 12.0);
    gl_Position = projectionMatrix * mv;
  }
`
const routeVertex = /* glsl */ `
  uniform float uScale;
  uniform float uVisible;
  uniform float uWave;
  uniform float uFogDensity;
  attribute float aS;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    float d = aS - uWave;
    float head = exp(-d * d * 4000.0);
    float trail = step(d, 0.0) * exp(d * 14.0);
    vec3 c = vec3(0.3, 1.0, 0.55) * (0.45 + trail * 1.4) + vec3(0.85, 1.0, 0.9) * head * 4.0;
    vColor = c * uVisible * exp(-pow(uFogDensity * dist, 2.0));
    gl_PointSize = clamp((1.3 + head * 3.5) * uScale / dist, 2.0, 16.0);
    gl_Position = projectionMatrix * mv;
  }
`
const dotFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c) * 4.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r * 2.4), 1.0);
  }
`

/** Traffic lights and the green-wave bike route on top of the road network. */
export class City {
  readonly group = new Group()
  private lightMat: ShaderMaterial
  private routeMat: ShaderMaterial
  private route: Vector2[] = []
  private routeS: number[] = []
  /** World position of the green-wave head (for the HUD label). */
  readonly head = new Vector3()

  constructor() {
    const y = CITY_CENTER.y + 0.3
    const route = buildRoute()

    // Traffic lights: ring × radial intersections, random street corners, and the route.
    const lights: number[] = []
    const info: number[] = []
    RINGS.forEach((r, i) => {
      for (let k = 0; k < RADIALS; k++) {
        const a = radialAngle(k, r)
        const p = ringPoint(r, a, i)
        lights.push(p.x, y, p.y)
        info.push(Math.random(), -1)
      }
    })
    for (let j = 0; j < 520; j++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * CITY_RADIUS * 0.95
      const p = new Vector2(Math.cos(a) * r, Math.sin(a) * r)
      if (inRiver(p)) continue
      lights.push(p.x, y, p.y)
      info.push(Math.random(), -1)
    }
    const routeLen: number[] = [0]
    for (let j = 1; j < route.length; j++) routeLen.push(routeLen[j - 1] + route[j].distanceTo(route[j - 1]))
    const L = routeLen[routeLen.length - 1]
    this.route = route
    this.routeS = routeLen.map((l) => l / L)
    for (let j = 0; j < route.length; j += 4) {
      lights.push(route[j].x, y + 0.2, route[j].y)
      info.push(0, routeLen[j] / L)
    }
    const lg = new BufferGeometry()
    lg.setAttribute('position', new BufferAttribute(new Float32Array(lights), 3))
    lg.setAttribute('aInfo', new BufferAttribute(new Float32Array(info), 2))
    this.lightMat = new ShaderMaterial({
      vertexShader: lightVertex,
      fragmentShader: dotFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uVisible: { value: 0 },
        uWave: { value: 0 },
        uFogDensity: shared.uFogDensity,
      },
    })
    const lightPoints = new Points(lg, this.lightMat)
    lightPoints.frustumCulled = false
    lightPoints.position.set(CITY_CENTER.x, 0, CITY_CENTER.z)

    // Route: densely sampled dots.
    const rp: number[] = []
    const rs: number[] = []
    for (let j = 1; j < route.length; j++) {
      const a = route[j - 1]
      const b = route[j]
      const n = Math.ceil(a.distanceTo(b) / 0.35)
      for (let q = 0; q < n; q++) {
        const t = q / n
        rp.push(a.x + (b.x - a.x) * t, y + 0.1, a.y + (b.y - a.y) * t)
        rs.push((routeLen[j - 1] + (routeLen[j] - routeLen[j - 1]) * t) / L)
      }
    }
    const rg = new BufferGeometry()
    rg.setAttribute('position', new BufferAttribute(new Float32Array(rp), 3))
    rg.setAttribute('aS', new BufferAttribute(new Float32Array(rs), 1))
    this.routeMat = new ShaderMaterial({
      vertexShader: routeVertex,
      fragmentShader: dotFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uVisible: { value: 0 },
        uWave: { value: 0 },
        uFogDensity: shared.uFogDensity,
      },
    })
    const routePoints = new Points(rg, this.routeMat)
    routePoints.frustumCulled = false
    routePoints.position.copy(lightPoints.position)

    this.group.add(lightPoints, routePoints)
  }

  /** @param wave 0..1 position of the green wave along the route */
  update(visible: number, wave: number, time: number, scale: number) {
    this.group.visible = visible > 0.001
    for (const m of [this.lightMat, this.routeMat]) {
      m.uniforms.uVisible.value = visible
      m.uniforms.uWave.value = wave
      m.uniforms.uScale.value = scale
    }
    this.lightMat.uniforms.uTime.value = time
    let k = 0
    while (k < this.routeS.length - 2 && this.routeS[k + 1] < wave) k++
    const t = Math.min(1, Math.max(0, (wave - this.routeS[k]) / (this.routeS[k + 1] - this.routeS[k] || 1)))
    const a = this.route[k]
    const b = this.route[k + 1]
    this.head.set(CITY_CENTER.x + a.x + (b.x - a.x) * t, CITY_CENTER.y + 1, CITY_CENTER.z + a.y + (b.y - a.y) * t)
  }
}
