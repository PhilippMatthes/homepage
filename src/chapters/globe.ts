import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { MultiPolygon, Polygon } from 'geojson'
import landUrl from 'world-atlas/land-50m.json?url'
import { palette, themeGlsl, themeUniforms } from '../core/palette'
import { moodAccent } from '../core/mood'
import { GLOBE_CENTER, GLOBE_RADIUS, latLonToWorld } from '../world/layout'
import { sunDirection } from '../world/sun'

/** Rasterizes the land outline to an equirectangular mask. */
async function landMask(w = 2048, h = 1024) {
  const topo = (await (await fetch(landUrl)).json()) as Topology<{ land: GeometryCollection }>
  const land = feature(topo, topo.objects.land)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  const polys: number[][][][] = []
  for (const f of land.features) {
    const g = f.geometry as Polygon | MultiPolygon
    if (g.type === 'Polygon') polys.push(g.coordinates)
    else polys.push(...g.coordinates)
  }
  for (const poly of polys) {
    ctx.beginPath()
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const x = ((lon + 180) / 360) * w
        const y = ((90 - lat) / 180) * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
  const data = ctx.getImageData(0, 0, w, h).data
  return (lat: number, lon: number) => {
    const x = Math.min(w - 1, Math.floor(((lon + 180) / 360) * w))
    const y = Math.min(h - 1, Math.floor(((90 - lat) / 180) * h))
    return data[(y * w + x) * 4] > 127
  }
}

const toRad = Math.PI / 180
/** Great-circle angle (radians) between two lat/lon points. */
function angleBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = Math.sin(((lat2 - lat1) * toRad) / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(((lon2 - lon1) * toRad) / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Land dots on the globe; w is a smooth closeness to Dresden (no hard borders). */
export async function globeTargets(count: number) {
  const isLand = await landMask()
  const out = new Float32Array(count * 4)
  const v = new Vector3()
  let n = 0
  let guard = 0
  while (n < count && guard++ < count * 60) {
    const z = Math.random() * 2 - 1
    const lat = (Math.asin(z) * 180) / Math.PI
    const lon = Math.random() * 360 - 180
    if (!isLand(lat, lon)) continue
    const ang = angleBetween(lat, lon, PLACES.dresden.lat, PLACES.dresden.lon)
    const t = Math.min(1, Math.max(0, (0.75 - ang) / 0.7))
    const w = t * t * (3 - 2 * t)
    // Slightly denser close to home, fading smoothly with distance.
    if (Math.random() > 0.55 + 0.45 * w) continue
    latLonToWorld(lat, lon, v, GLOBE_RADIUS * 1.001)
    out[n * 4] = v.x
    out[n * 4 + 1] = v.y
    out[n * 4 + 2] = v.z
    out[n * 4 + 3] = w
    n++
  }
  return out
}

export const PLACES = {
  dresden: { lat: 51.05, lon: 13.74, label: 'Dresden · home base' },
  hamburg: { lat: 53.55, lon: 10.0, label: 'Hamburg' },
  walldorf: { lat: 49.3, lon: 8.64, label: 'Walldorf' },
}
/** Collaboration arcs: Europe and around the world. */
const ARC_TARGETS: Array<[number, number]> = [
  [53.55, 10.0], [49.3, 8.64], [52.37, 4.9], [48.86, 2.35], [51.51, -0.13], [59.33, 18.07],
  [40.42, -3.7], [45.46, 9.19], [52.23, 21.01], [37.77, -122.42], [40.71, -74.0], [43.65, -79.38],
  [12.97, 77.59], [1.35, 103.82], [35.68, 139.69], [-23.55, -46.63], [-33.87, 151.21], [25.2, 55.27],
]

const atmosphereShader = {
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uBg;
    uniform float uVisible;
    uniform float uInner;
    uniform vec3 uSunDir;
    varying vec3 vN;
    varying vec3 vW;
    const vec3 DUSK = vec3(1.0, 0.58, 0.32);
    void main() {
      vec3 v = normalize(cameraPosition - vW);
      float f = abs(dot(v, vN));
      // The real sun right now: day side, night side and a warm dusk band between.
      float s = dot(vN, uSunDir);
      float day = smoothstep(-0.12, 0.2, s);
      float dusk = exp(-pow(s / 0.09, 2.0));
      if (uInner > 0.5) {
        // Ocean: the live background color plus a rim glow, faded in with alpha so
        // the previous chapter's mood dissolves into the globe instead of cutting.
        vec3 base = uBg * mix(0.55, 1.0, day) + uColor * 0.05 * day;
        vec3 rim = uColor * pow(1.0 - f, 3.0) * mix(0.22, 0.5, day);
        gl_FragColor = vec4(base + rim + DUSK * dusk * 0.07, uVisible);
      } else {
        vec3 c = mix(uColor, DUSK, 0.45 * dusk) * mix(0.45, 1.0, day);
        gl_FragColor = vec4(c * pow(f, 4.0) * 0.9 * uVisible, 1.0);
      }
    }
  `,
}

/** Ocean body, atmosphere, the Dresden beacon and data arcs across Europe. */
export class Globe {
  readonly group = new Group()
  private ocean: Mesh
  private oceanMat: ShaderMaterial
  private atmoMat: ShaderMaterial
  private arcMat: LineBasicMaterial
  private pulseMat: ShaderMaterial
  private pulseGeo: BufferGeometry
  private arcs: Vector3[][] = []
  private beaconMat: ShaderMaterial
  readonly anchors: Record<keyof typeof PLACES, Vector3>
  /** World-space direction to the sun; shared with the particles' globe dots. */
  readonly sunDir = { value: sunDirection() }
  private sunCheckedAt = -Infinity
  /** Atmosphere rim: cyan, leaning towards the current chapter accent. */
  private rim = palette.cyan.clone()

  constructor() {
    const R = GLOBE_RADIUS
    this.oceanMat = new ShaderMaterial({
      ...atmosphereShader,
      uniforms: { uColor: { value: palette.blue }, uBg: { value: palette.bg }, uVisible: { value: 0 }, uInner: { value: 1 }, uSunDir: this.sunDir },
      transparent: true,
      // Still writes depth so the far side's land dots stay hidden.
      depthWrite: true,
    })
    this.ocean = new Mesh(new SphereGeometry(R * 0.995, 96, 64), this.oceanMat)
    this.ocean.position.copy(GLOBE_CENTER)
    this.ocean.renderOrder = -5
    this.atmoMat = new ShaderMaterial({
      ...atmosphereShader,
      uniforms: { uColor: { value: this.rim }, uBg: { value: palette.bg }, uVisible: { value: 0 }, uInner: { value: 0 }, uSunDir: this.sunDir },
      side: BackSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const atmo = new Mesh(new SphereGeometry(R * 1.12, 96, 64), this.atmoMat)
    atmo.position.copy(GLOBE_CENTER)
    this.group.add(this.ocean, atmo)

    // Great-circle arcs from Dresden, lifted above the surface.
    const from = PLACES.dresden
    this.arcMat = new LineBasicMaterial({
      color: palette.ice,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const a = latLonToWorld(from.lat, from.lon).sub(GLOBE_CENTER).normalize()
    for (const [lat, lon] of ARC_TARGETS) {
      const b = latLonToWorld(lat, lon).sub(GLOBE_CENTER).normalize()
      const angle = a.angleTo(b)
      const pts: Vector3[] = []
      for (let i = 0; i <= 48; i++) {
        const t = i / 48
        const s = Math.sin(angle)
        const p = a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(b.clone().multiplyScalar(Math.sin(t * angle) / s))
        const lift = 1 + Math.sin(Math.PI * t) * Math.min(angle * 0.16, 0.1)
        pts.push(p.multiplyScalar(R * lift).add(GLOBE_CENTER))
      }
      this.arcs.push(pts)
      this.group.add(new Line(new BufferGeometry().setFromPoints(pts), this.arcMat))
    }

    // Pulses travelling along the arcs (positions updated on the CPU; there are few).
    const TAIL = 8
    this.pulseGeo = new BufferGeometry()
    this.pulseGeo.setAttribute('position', new BufferAttribute(new Float32Array(this.arcs.length * TAIL * 3), 3))
    const fade = new Float32Array(this.arcs.length * TAIL)
    for (let i = 0; i < fade.length; i++) fade[i] = 1 - (i % TAIL) / TAIL
    this.pulseGeo.setAttribute('aFade', new BufferAttribute(fade, 1))
    // 0 while a packet is in flight, then a short amber flash when it lands.
    this.pulseGeo.setAttribute('aArrive', new BufferAttribute(new Float32Array(fade.length), 1))
    this.pulseMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uVisible; uniform float uScale;
        attribute float aFade; attribute float aArrive; varying float vA; varying float vArrive;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float flash = aArrive * (1.0 - aArrive) * 4.0;
          gl_PointSize = clamp(9.0 * uScale / -mv.z * aFade * (1.0 + 1.5 * flash), 1.0, 18.0);
          vA = aFade * uVisible * (1.0 - smoothstep(0.6, 1.0, aArrive));
          vArrive = flash;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${themeGlsl}
        varying float vA; varying float vArrive;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;
          vec3 col = mix(uThSpark, uThHot, vArrive);
          gl_FragColor = vec4(col * exp(-r * 2.5) * vA * 1.6, 1.0);
        }`,
    })
    const pulses = new Points(this.pulseGeo, this.pulseMat)
    pulses.frustumCulled = false
    this.group.add(pulses)

    // Pulsing beacon over Dresden.
    this.anchors = {
      dresden: latLonToWorld(PLACES.dresden.lat, PLACES.dresden.lon, new Vector3(), R * 1.004),
      hamburg: latLonToWorld(PLACES.hamburg.lat, PLACES.hamburg.lon, new Vector3(), R * 1.004),
      walldorf: latLonToWorld(PLACES.walldorf.lat, PLACES.walldorf.lon, new Vector3(), R * 1.004),
    }
    this.beaconMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...themeUniforms, uVisible: { value: 0 }, uScale: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale; uniform float uTime;
        attribute float aRing; varying float vRing;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vRing = aRing;
          float grow = aRing > 0.5 ? fract(uTime * 0.5) : 0.0;
          gl_PointSize = clamp((aRing > 0.5 ? 60.0 + grow * 260.0 : 26.0) * uScale / -mv.z, 2.0, 120.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${themeGlsl}
        uniform float uVisible; uniform float uTime; varying float vRing;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
          float a;
          if (vRing > 0.5) { float t = fract(uTime * 0.5); a = smoothstep(0.08, 0.0, abs(r - 0.92)) * (1.0 - t); }
          else a = exp(-r * r * 6.0) * 1.5;
          gl_FragColor = vec4(uThSpark * a * uVisible, 1.0);
        }`,
    })
    const bg = new BufferGeometry()
    const d = this.anchors.dresden
    bg.setAttribute('position', new BufferAttribute(new Float32Array([d.x, d.y, d.z, d.x, d.y, d.z]), 3))
    bg.setAttribute('aRing', new BufferAttribute(new Float32Array([0, 1]), 1))
    const beacon = new Points(bg, this.beaconMat)
    beacon.frustumCulled = false
    this.group.add(beacon)
  }

  update(visible: number, time: number, scale: number) {
    this.group.visible = visible > 0.001
    if (!this.group.visible) return
    // The terminator moves 0.25° a minute; re-aim the sun every few seconds.
    if (time - this.sunCheckedAt > 5) {
      this.sunCheckedAt = time
      sunDirection(new Date(), this.sunDir.value)
    }
    this.oceanMat.uniforms.uVisible.value = visible
    this.atmoMat.uniforms.uVisible.value = visible
    this.rim.copy(palette.cyan).lerp(moodAccent, 0.6)
    this.arcMat.opacity = 0.32 * visible
    this.pulseMat.uniforms.uVisible.value = visible
    this.pulseMat.uniforms.uScale.value = scale
    this.beaconMat.uniforms.uVisible.value = visible
    this.beaconMat.uniforms.uScale.value = scale
    this.beaconMat.uniforms.uTime.value = time

    const pos = this.pulseGeo.attributes.position as BufferAttribute
    const arrive = this.pulseGeo.attributes.aArrive as BufferAttribute
    const TAIL = 8
    this.arcs.forEach((pts, i) => {
      const head = (time * 0.35 + i * 0.37) % 1.4
      // The tail piles up on the target after t = 1; that pause is the landing.
      const landed = Math.min(1, Math.max(0, (head - 1 - TAIL * 0.012) / (0.4 - TAIL * 0.012)))
      for (let j = 0; j < TAIL; j++) {
        const t = Math.min(1, Math.max(0, head - j * 0.012))
        const f = t * (pts.length - 1)
        const k = Math.min(pts.length - 2, Math.floor(f))
        const p = pts[k].clone().lerp(pts[k + 1], f - k)
        pos.setXYZ(i * TAIL + j, p.x, p.y, p.z)
        arrive.setX(i * TAIL + j, landed)
      }
    })
    pos.needsUpdate = true
    arrive.needsUpdate = true
  }
}
