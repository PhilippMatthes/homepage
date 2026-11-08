import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  QuadraticBezierCurve3,
  ShaderMaterial,
  Vector3,
} from 'three'
import { palette, shade, themeGlsl, themeUniforms } from '../core/palette'
import { shared } from '../core/shared'
import { clamp01, smooth } from '../core/timeline'
import { holoMaterial, setHoloFade } from '../fx/holoMaterial'
import { HALL } from '../world/layout'
import { packetGlsl } from '../fx/packets'

interface Site {
  p: Vector3
  /** Footprint scale relative to the main hall. */
  s: number
  r: number
  outer: boolean
  /** Index of the site it is linked from (-1: the hub). */
  parent: number
  /** Window of the grow value in which its link draws out, then the building rises. */
  link: [number, number]
  rise: [number, number]
  /** Speed and phase of the packets on the link that feeds it (for the arrival ping). */
  speed: number
  phase: number
  group?: Group
}

interface Link {
  curve: QuadraticBezierCurve3
  grow: [number, number]
  speed: number
  phase: number
  outer: boolean
  tint: [number, number]
}

/** Deterministic pseudo-random in [0, 1). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Squeezes a full-circle angle into [a0, a1] (degrees). On desktop the chapter copy sits
 * on the right, over the sites east of the hub (-x…+z quadrant seen from the camera keys
 * at p 0.255–0.295), so that wedge stays clear and only fibre routes cross it.
 */
const arc = (a: number, a0: number, a1: number) => {
  const t = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
  return ((a0 + t * (a1 - a0)) * Math.PI) / 180
}

const SEGMENTS = 64
/** Packets travel at about this many meters per second, whatever the link length. */
const PACKET_SPEED = 16

/**
 * Other datacenters around the main hall, linked by glowing fibre routes
 * that carry data packets. While the camera pulls back the network unfurls
 * from the hub: each route draws out, then its datacenter rises out of the floor
 * and starts pinging as traffic arrives. A far ring fades into the fog: 20+ sites.
 */
export class Network {
  readonly group = new Group()
  /** Top of the hub's light beacon, where the HUD pins the site count. */
  readonly beaconTop = new Vector3(0, HALL.height + 15, 0)
  private shellMat = holoMaterial({ transparent: true, panels: 2.4, windows: 1.2, fill: shade(palette.deep, 0.4), edge: palette.cyan, glow: 0.9 })
  private unitMat = holoMaterial({ transparent: true, fill: shade(palette.deep, 0.58), edge: palette.ice, glow: 0.8 })
  private ribbonMat: ShaderMaterial
  private headMat: ShaderMaterial
  private headGeo: BufferGeometry
  private poolMat: ShaderMaterial
  private poolState: InstancedBufferAttribute
  private beaconMat: ShaderMaterial
  private sites: Site[] = []
  private links: Link[] = []
  private tmp = new Vector3()

  constructor() {
    this.layoutSites()

    const hub = new Vector3(0, HALL.height, 0)
    const roof = (v: Vector3) => v.clone().setY(HALL.height)
    const link = (a: Vector3, b: Vector3, grow: [number, number], outer: boolean, seed: number) => {
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const d = a.distanceTo(b)
      mid.y += d * (0.16 + 0.14 * hash(seed))
      const curve = new QuadraticBezierCurve3(a, mid, b)
      const len = curve.getLength()
      const l: Link = {
        curve,
        grow,
        speed: PACKET_SPEED / len,
        phase: hash(seed + 0.5),
        outer,
        tint: [hash(seed + 1.3), hash(seed + 2.7)],
      }
      this.links.push(l)
      return l
    }
    // Hub → inner sites, inner → outer sites, then a ring between inner neighbours.
    this.sites.forEach((s, i) => {
      const from = s.parent < 0 ? hub : roof(this.sites[s.parent].p)
      const l = link(from, roof(s.p), s.link, s.outer, i)
      s.speed = l.speed
      s.phase = l.phase
    })
    const inner = this.sites.filter((s) => !s.outer)
    inner.forEach((s, i) => {
      const n = inner[(i + 1) % inner.length]
      const start = Math.min(0.82, Math.max(s.rise[1], n.rise[1]))
      link(roof(s.p), roof(n.p), [start, start + 0.16], false, 40 + i)
    })

    for (const site of this.sites) site.group = this.buildSite(site)
    this.ribbonMat = this.buildRibbons()
    ;({ geo: this.headGeo, mat: this.headMat } = this.buildHeads())
    ;({ mat: this.poolMat, state: this.poolState } = this.buildPools())
    this.beaconMat = this.buildBeacon()
  }

  /** Nine sites around the hub, twelve small ones further out, each with its reveal window. */
  private layoutSites() {
    const n = 9
    for (let i = 0; i < n; i++) {
      const a = arc((i / n) * Math.PI * 2 + 0.35 * Math.sin(i * 2.3), 50, 300)
      const d = 62 + 38 * ((i * 0.618) % 1)
      this.sites.push({
        p: new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d),
        s: 0.45 + 0.35 * ((i * 0.37) % 1),
        r: (i % 2) * Math.PI / 2,
        outer: false,
        parent: -1,
        link: [0, 0],
        rise: [0, 0],
        speed: 0,
        phase: 0,
      })
    }
    // Reveal like a radar sweep, starting from the sites nearest the camera (+z).
    const sweep = (p: Vector3) => (Math.atan2(p.x, p.z) + Math.PI * 2) % (Math.PI * 2)
    const order = this.sites.map((_, i) => i).sort((a, b) => sweep(this.sites[a].p) - sweep(this.sites[b].p))
    order.forEach((idx, rank) => {
      const s = this.sites[idx]
      const start = 0.02 + 0.42 * (rank / (n - 1))
      s.link = [start, start + 0.16]
      s.rise = [start + 0.13, start + 0.24]
    })

    const m = 12
    for (let j = 0; j < m; j++) {
      const a = arc(((j + 0.5) / m) * Math.PI * 2 + 0.25 * (hash(j) - 0.5), -10, 315)
      const d = 125 + 50 * hash(j + 7)
      const p = new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)
      let parent = 0
      for (let i = 1; i < n; i++) if (this.sites[i].p.distanceTo(p) < this.sites[parent].p.distanceTo(p)) parent = i
      const start = Math.min(0.68, this.sites[parent].rise[1] + 0.06 * hash(j + 3))
      this.sites.push({
        p,
        s: 0.26 + 0.14 * hash(j + 11),
        r: hash(j + 5) < 0.5 ? 0 : Math.PI / 2,
        outer: true,
        parent,
        link: [start, start + 0.14],
        rise: [start + 0.11, start + 0.2],
        speed: 0,
        phase: 0,
      })
    }
  }

  private buildSite({ p, s, r, outer }: Site) {
    const b = new Group()
    b.position.copy(p)
    b.rotation.y = r
    const shell = new Mesh(new BoxGeometry(2 * HALL.halfX * s, HALL.height, 2 * HALL.halfZ * s), this.shellMat)
    shell.position.y = HALL.height / 2
    b.add(shell)
    for (let j = -1; j <= 1; j += outer ? 2 : 1) {
      const unit = new Mesh(new BoxGeometry(1.4 * (outer ? 0.7 : 1), 0.45, 1.3 * (outer ? 0.7 : 1)), this.unitMat)
      unit.position.set(0, HALL.height + 0.25, j * HALL.halfZ * s * 0.55)
      b.add(unit)
    }
    this.group.add(b)
    return b
  }

  /** All routes as one mesh of camera-facing ribbons; packets run along them in the shader. */
  private buildRibbons() {
    const L = this.links.length
    const verts = L * (SEGMENTS + 1) * 2
    const pos = new Float32Array(verts * 3)
    const tan = new Float32Array(verts * 3)
    const side = new Float32Array(verts)
    const t = new Float32Array(verts)
    const meta = new Float32Array(verts * 4)
    const grow = new Float32Array(verts * 2)
    const tint = new Float32Array(verts * 2)
    const index: number[] = []
    const pt = new Vector3()
    const tg = new Vector3()
    let v = 0
    this.links.forEach((l) => {
      const len = l.curve.getLength()
      const base = v
      for (let k = 0; k <= SEGMENTS; k++) {
        const u = k / SEGMENTS
        l.curve.getPoint(u, pt)
        l.curve.getTangent(u, tg)
        for (const sd of [-1, 1]) {
          pos.set([pt.x, pt.y, pt.z], v * 3)
          tan.set([tg.x, tg.y, tg.z], v * 3)
          side[v] = sd
          t[v] = u
          meta.set([l.phase, l.speed, len, l.outer ? 1 : 0], v * 4)
          grow.set(l.grow, v * 2)
          tint.set(l.tint, v * 2)
          v++
        }
        if (k < SEGMENTS) {
          const a = base + k * 2
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
    })
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aTan', new BufferAttribute(tan, 3))
    geo.setAttribute('aSide', new BufferAttribute(side, 1))
    geo.setAttribute('aT', new BufferAttribute(t, 1))
    geo.setAttribute('aMeta', new BufferAttribute(meta, 4))
    geo.setAttribute('aGrow', new BufferAttribute(grow, 2))
    geo.setAttribute('aTint', new BufferAttribute(tint, 2))
    geo.setIndex(index)

    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        ...themeUniforms,
        uVisible: { value: 0 },
        uGrow: { value: 0 },
        uTime: { value: 0 },
        uScale: { value: 1 },
        uDpr: { value: 1 },
        uFogDensity: shared.uFogDensity,
      },
      vertexShader: /* glsl */ `
        uniform float uScale; uniform float uDpr; uniform float uGrow;
        attribute vec3 aTan; attribute float aSide; attribute float aT;
        attribute vec4 aMeta; attribute vec2 aGrow; attribute vec2 aTint;
        varying float vSide; varying float vT; varying float vGrow; varying vec4 vMeta; varying vec2 vTint; varying float vDist;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec3 V = normalize(cameraPosition - w.xyz);
          vec3 T = normalize(mat3(modelMatrix) * aTan);
          vec3 S = normalize(cross(T, V));
          float depth = -(viewMatrix * w).z;
          // Half width in CSS pixels, so the glow reads the same at every zoom.
          float px = mix(4.5, 3.0, aMeta.w);
          w.xyz += S * aSide * px * uDpr * depth / uScale;
          vSide = aSide; vT = aT; vMeta = aMeta; vTint = aTint;
          vGrow = clamp((uGrow - aGrow.x) / (aGrow.y - aGrow.x), 0.0, 1.0);
          vDist = length(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform float uTime; uniform float uFogDensity;
        varying float vSide; varying float vT; varying float vGrow; varying vec4 vMeta; varying vec2 vTint; varying float vDist;
        ${themeGlsl}
        ${packetGlsl}
        void main() {
          // A route draws out from its source; the grow front is a bright spark.
          if (vT > vGrow + 0.001) discard;
          float x2 = vSide * vSide;
          float core = exp(-x2 * 22.0);
          float halo = exp(-x2 * 3.5) * (1.0 - x2);
          float len = vMeta.z;
          float front = exp(-(vGrow - vT) * len * 0.6) * (1.0 - step(0.999, vGrow));
          // Traffic starts once the route is up: one packet each way, tails in meters.
          float live = smoothstep(0.98, 1.0, vGrow);
          float h0 = fract(uTime * vMeta.y + vMeta.x);
          float d0 = (h0 - vT) * len;
          float p0 = d0 >= 0.0 ? exp(-d0 * 0.45) : 0.0;
          float h1 = fract(uTime * vMeta.y + vMeta.x + 0.5);
          float d1 = (vT - (1.0 - h1)) * len;
          float p1 = d1 >= 0.0 ? exp(-d1 * 0.45) : 0.0;
          float dim = mix(1.0, 0.6, vMeta.w);
          vec3 fibre = mix(uThGlow, uThSpark, 0.15 + 0.25 * vT);
          vec3 c = fibre * (0.08 * halo + 0.32 * core) * dim;
          c += (packetColor(-1.0, vTint.x) * p0 + packetColor(1.0, vTint.y) * p1) * (1.1 * core + 0.35 * halo) * live * dim;
          c += uThSpark * front * (1.6 * core + 0.6 * halo);
          float fog = exp(-pow(uFogDensity * vDist * 1.25, 2.0));
          gl_FragColor = vec4(c * uVisible * fog, 1.0);
        }`,
    })
    const mesh = new Mesh(geo, mat)
    mesh.frustumCulled = false
    this.group.add(mesh)
    return mat
  }

  /** A bright point on each packet's head, so it catches the bloom. */
  private buildHeads() {
    const n = this.links.length * 2
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('aAlpha', new BufferAttribute(new Float32Array(n), 1))
    const tint = new Float32Array(n)
    const dir = new Float32Array(n)
    this.links.forEach((l, i) => {
      tint[i * 2] = l.tint[0]
      tint[i * 2 + 1] = l.tint[1]
      dir[i * 2] = -1 // outbound from the hub
      dir[i * 2 + 1] = 1
    })
    geo.setAttribute('aTint', new BufferAttribute(tint, 1))
    geo.setAttribute('aDir', new BufferAttribute(dir, 1))
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uDpr: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uVisible; uniform float uDpr;
        attribute float aAlpha; attribute float aTint; attribute float aDir; varying float vA; varying vec3 vColor;
        ${packetGlsl}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 9.0 * uDpr;
          vA = aAlpha * uVisible;
          vColor = packetColor(aDir, aTint);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4((vColor + 0.4) * exp(-r * 4.0) * vA * 1.5, 1.0);
        }`,
    })
    const pts = new Points(geo, mat)
    pts.frustumCulled = false
    this.group.add(pts)
    return { geo, mat }
  }

  /** Light pools under every site (and the hub) that ring out when a packet arrives. */
  private buildPools() {
    const n = this.sites.length + 1
    const geo = new PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    const state = new InstancedBufferAttribute(new Float32Array(n * 4), 4)
    geo.setAttribute('aState', state)
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uTime: { value: 0 }, uFogDensity: shared.uFogDensity },
      vertexShader: /* glsl */ `
        attribute vec4 aState; varying vec4 vState; varying vec2 vUv; varying float vDist;
        void main() {
          vUv = uv; vState = aState;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vDist = length(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform float uTime; uniform float uFogDensity;
        varying vec4 vState; varying vec2 vUv; varying float vDist;
        ${themeGlsl}
        void main() {
          float r = length(vUv * 2.0 - 1.0);
          if (r > 1.0) discard;
          // x: packet speed, y: phase, z: rise (0..1), w: ping strength
          float pool = exp(-r * r * 6.0) * 0.32 * vState.z;
          float age = fract(uTime * vState.x + vState.y);
          float ring = exp(-pow((r - 0.15 - age * 0.8) * 16.0, 2.0)) * pow(1.0 - age, 2.0) * vState.w;
          float rim = exp(-pow((r - 0.42) * 30.0, 2.0)) * 0.12 * vState.z;
          vec3 c = uThGlow * (pool + rim) + mix(uThGlow, uThSpark, 0.5) * ring * 0.6;
          float fog = exp(-pow(uFogDensity * vDist * 1.25, 2.0));
          gl_FragColor = vec4(c * uVisible * fog, 1.0);
        }`,
    })
    const mesh = new InstancedMesh(geo, mat, n)
    const m = new Matrix4()
    const footprint = (s: number) => 2.6 * Math.max(HALL.halfX, HALL.halfZ) * s
    this.sites.forEach((s, i) => {
      const k = footprint(s.s)
      m.makeScale(k, 1, k).setPosition(s.p.x, 0.02, s.p.z)
      mesh.setMatrixAt(i, m)
    })
    const hubK = footprint(1.15)
    m.makeScale(hubK, 1, hubK).setPosition(0, 0.02, 0)
    mesh.setMatrixAt(n - 1, m)
    // The hub pings on its own slow heartbeat.
    state.setXYZW(n - 1, 0.45, 0, 1, 0.8)
    mesh.renderOrder = -1
    mesh.frustumCulled = false
    this.group.add(mesh)
    return { mesh, mat, state }
  }

  /** A column of light above the main hall: you are here. */
  private buildBeacon() {
    const h = this.beaconTop.y - HALL.height
    const geo = new CylinderGeometry(0.7, 1.6, h, 32, 1, true)
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform float uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        ${themeGlsl}
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          float facing = pow(abs(dot(V, vN)), 2.0);
          float fade = pow(1.0 - vUv.y, 1.6);
          // Pulses rise up the column.
          float pulse = 0.65 + 0.35 * pow(0.5 + 0.5 * sin(vUv.y * 14.0 - uTime * 3.0), 6.0);
          vec3 c = mix(uThGlow, uThSpark, 0.35) * facing * fade * pulse * 0.55;
          gl_FragColor = vec4(c * uVisible, 1.0);
        }`,
    })
    const mesh = new Mesh(geo, mat)
    mesh.position.set(0, HALL.height + h / 2, 0)
    mesh.renderOrder = 2
    this.group.add(mesh)
    return mat
  }

  /**
   * @param visible 0..1 overall visibility of the network
   * @param grow 0..1 how far the network has unfurled from the hub
   */
  update(visible: number, grow: number, time: number, scale: number, dpr: number) {
    this.group.visible = visible > 0.001
    if (!this.group.visible) return
    setHoloFade(this.shellMat, visible, 0.9 * visible)
    setHoloFade(this.unitMat, visible, visible)
    this.shellMat.uniforms.uTime.value = time

    const r = this.ribbonMat.uniforms
    r.uVisible.value = visible
    r.uGrow.value = grow
    r.uTime.value = time
    r.uScale.value = scale
    r.uDpr.value = dpr
    this.poolMat.uniforms.uVisible.value = visible
    this.poolMat.uniforms.uTime.value = time
    this.headMat.uniforms.uVisible.value = visible
    this.headMat.uniforms.uDpr.value = dpr
    this.beaconMat.uniforms.uVisible.value = visible * smooth(clamp01(grow * 4))
    this.beaconMat.uniforms.uTime.value = time

    // Buildings rise out of the floor once their route reaches them.
    this.sites.forEach((s, i) => {
      const rise = smooth(clamp01((grow - s.rise[0]) / (s.rise[1] - s.rise[0])))
      const g = s.group!
      g.visible = rise > 0.001
      g.scale.set(1, Math.max(rise, 0.001), 1)
      const live = clamp01((grow - s.link[1]) / 0.02)
      this.poolState.setXYZW(i, s.speed, s.phase, rise, live * rise)
    })
    this.poolState.setZ(this.sites.length, smooth(clamp01(grow * 5)))
    this.poolState.needsUpdate = true

    // Packet heads: the same timing as the ribbon shader.
    const pos = this.headGeo.attributes.position as BufferAttribute
    const alpha = this.headGeo.attributes.aAlpha as BufferAttribute
    this.links.forEach((l, i) => {
      const live = clamp01((grow - l.grow[1]) / 0.02)
      const h0 = (((time * l.speed + l.phase) % 1) + 1) % 1
      const h1 = (h0 + 0.5) % 1
      l.curve.getPoint(h0, this.tmp)
      pos.setXYZ(i * 2, this.tmp.x, this.tmp.y, this.tmp.z)
      l.curve.getPoint(1 - h1, this.tmp)
      pos.setXYZ(i * 2 + 1, this.tmp.x, this.tmp.y, this.tmp.z)
      const dim = l.outer ? 0.6 : 1
      alpha.setX(i * 2, live * dim)
      alpha.setX(i * 2 + 1, live * dim)
    })
    pos.needsUpdate = true
    alpha.needsUpdate = true
  }
}
