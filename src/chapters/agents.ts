import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { palette } from '../core/palette'
import { packetGlsl } from '../fx/packets'

/**
 * Agentic development & operations, above the open server board:
 * agents spawn from the GPU (inference), cross into an Envoy sandbox,
 * work through a review → release → knowledge-graph pipeline and leave
 * through the proxy. Everything is in server-local meters (+z = rack front,
 * which is screen-down in the top-down camera), and the group follows the server.
 */

const GPU = new Vector3(0, 0.01, 0.11)
export const STATIONS = [
  { name: 'review', pos: new Vector3(-0.028, 0.07, -0.035), color: [0.68, 0.62, 1.0] },
  { name: 'release', pos: new Vector3(0.064, 0.085, -0.115), color: [0.45, 1.0, 0.8] },
  { name: 'knowledge graph', pos: new Vector3(0.15, 0.07, -0.035), color: [1.0, 0.72, 0.42] },
] as const
/** Outside the sandbox: where traffic leaves through the proxy. */
const EGRESS = new Vector3(0.064, 0.16, -0.24)
const SANDBOX = { center: new Vector3(0.062, 0.07, -0.065), radii: new Vector3(0.155, 0.03, 0.1) }
const PATH = [GPU, STATIONS[0].pos, STATIONS[1].pos, STATIONS[2].pos, EGRESS]
const LABEL_LIFT = new Vector3(0, 0, -0.022)
/** Label spot on the sandbox's near (screen-bottom) rim. */
const SANDBOX_LABEL = SANDBOX.center.clone().add(new Vector3(-SANDBOX.radii.x * 0.35, 0, SANDBOX.radii.z * 0.98))

const AGENTS = 90
const TAIL = 6

const agentVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform vec3 uPath[5];
  uniform vec3 uCenter;
  uniform vec3 uRadii;
  attribute vec4 aSeed;   // phase, jitter x, jitter z, color pick
  attribute float aTail;  // 0 head … 1 end of tail
  varying vec3 vColor;
  varying float vA;
  ${packetGlsl}

  vec3 pathAt(float t) {
    float f = t * 4.0;
    int i = int(min(floor(f), 3.0));
    float u = f - float(i);
    // Ease in and out of every station, so agents visibly "work" there.
    float e = u * u * (3.0 - 2.0 * u);
    vec3 a = uPath[0]; vec3 b = uPath[1];
    if (i == 1) { a = uPath[1]; b = uPath[2]; }
    else if (i == 2) { a = uPath[2]; b = uPath[3]; }
    else if (i == 3) { a = uPath[3]; b = uPath[4]; }
    vec3 p = mix(a, b, e);
    p.y += sin(3.14159 * e) * 0.025;
    return p;
  }

  void main() {
    float speed = 0.07 + 0.03 * aSeed.y;
    float t = fract(aSeed.x + uTime * speed - aTail * 0.012);
    vec3 p = pathAt(t);
    p.xz += (aSeed.yz - 0.5) * 0.03 * sin(3.14159 * fract(t * 4.0));
    // Flash where the agent crosses the sandbox membrane (the Envoy proxy).
    float q = length((p - uCenter) / uRadii);
    float flash = exp(-pow((q - 1.0) / 0.12, 2.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float head = 1.0 - aTail;
    gl_PointSize = clamp(0.006 * uScale / -mv.z * (0.5 + 0.5 * head) * (1.0 + flash), 1.0, 12.0);
    gl_Position = projectionMatrix * mv;
    vColor = packetColor(aSeed.w) * (0.8 + 2.2 * flash);
    vA = head * head;
  }
`

const agentFragment = /* glsl */ `
  uniform float uVisible;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r * 2.5) * vA * uVisible, 1.0);
  }
`

export class Agents {
  readonly group = new Group()
  /** World positions of the station labels (updated every frame). */
  readonly anchors = STATIONS.map(() => new Vector3())
  readonly sandboxAnchor = new Vector3()
  private agentMat: ShaderMaterial
  private stationMat: ShaderMaterial
  private membraneMat: ShaderMaterial

  constructor() {
    // Agents with short tails.
    const g = new BufferGeometry()
    const n = AGENTS * TAIL
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    const seed = new Float32Array(n * 4)
    const tail = new Float32Array(n)
    for (let a = 0; a < AGENTS; a++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()]
      for (let j = 0; j < TAIL; j++) {
        seed.set(s, (a * TAIL + j) * 4)
        tail[a * TAIL + j] = j / TAIL
      }
    }
    g.setAttribute('aSeed', new BufferAttribute(seed, 4))
    g.setAttribute('aTail', new BufferAttribute(tail, 1))
    this.agentMat = new ShaderMaterial({
      vertexShader: agentVertex,
      fragmentShader: agentFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uVisible: { value: 0 },
        uPath: { value: PATH },
        uCenter: { value: SANDBOX.center },
        uRadii: { value: SANDBOX.radii },
      },
    })
    const agents = new Points(g, this.agentMat)
    agents.frustumCulled = false

    // Stations: a soft core and a slowly breathing ring each.
    const sg = new BufferGeometry()
    sg.setAttribute('position', new BufferAttribute(new Float32Array(STATIONS.flatMap((s) => s.pos.toArray())), 3))
    sg.setAttribute('aColor', new BufferAttribute(new Float32Array(STATIONS.flatMap((s) => [...s.color])), 3))
    this.stationMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uVisible: { value: 0 }, uScale: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale; attribute vec3 aColor; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(0.05 * uScale / -mv.z, 4.0, 90.0);
          vColor = aColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform float uTime; varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
          float ring = smoothstep(0.06, 0.0, abs(r - (0.78 + 0.06 * sin(uTime * 2.0))));
          float core = exp(-r * r * 30.0);
          gl_FragColor = vec4(vColor * (ring * 0.9 + core * 1.4) * uVisible, 1.0);
        }`,
    })
    const stations = new Points(sg, this.stationMat)
    stations.frustumCulled = false

    // The sandbox: a flat glass ellipsoid with a fresnel rim.
    this.membraneMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uVisible: { value: 0 }, uColor: { value: palette.cyan }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main() {
          vL = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz;
          // normalMatrix handles the ellipsoid's non-uniform scale.
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVisible; uniform vec3 uColor; uniform float uTime;
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main() {
          float f = 1.0 - abs(dot(normalize(vV), normalize(vN)));
          // Faint hex-ish lattice drifting over the surface.
          vec2 g = vec2(atan(vL.z, vL.x) * 9.0, vL.y * 14.0 + uTime * 0.3);
          float lat = smoothstep(0.92, 1.0, max(abs(sin(g.x * 3.14159)), abs(sin(g.y * 3.14159))));
          float a = pow(f, 3.0) * 0.4 + lat * 0.05;
          gl_FragColor = vec4(uColor * a * uVisible, 1.0);
        }`,
    })
    const membrane = new Mesh(new SphereGeometry(1, 48, 24), this.membraneMat)
    membrane.scale.copy(SANDBOX.radii)
    membrane.position.copy(SANDBOX.center)
    membrane.renderOrder = 3

    this.group.add(membrane, stations, agents)
  }

  update(o: { visible: number; time: number; scale: number; origin: Vector3 }) {
    this.group.visible = o.visible > 0.001
    this.group.position.copy(o.origin)
    // Labels sit just above each ring on screen (-z is up in the top-down view).
    STATIONS.forEach((s, i) => this.anchors[i].copy(s.pos).add(o.origin).add(LABEL_LIFT))
    this.sandboxAnchor.copy(SANDBOX_LABEL).add(o.origin)
    if (!this.group.visible) return
    for (const m of [this.agentMat, this.stationMat, this.membraneMat]) {
      m.uniforms.uVisible.value = o.visible
      m.uniforms.uTime.value = o.time
    }
    this.agentMat.uniforms.uScale.value = o.scale
    this.stationMat.uniforms.uScale.value = o.scale
  }
}
