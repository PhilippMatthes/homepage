import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { classes, loadRampGlsl, palette } from '../core/palette'
import { shared } from '../core/shared'
import { packetGlsl } from './packets'
import { DASH } from '../chapters/dashboard'
import { PORTRAIT_CENTER, PORTRAIT_SIZE } from '../world/layout'

export interface MorphTargets {
  count: number
  /** Portrait positions (world), colors and visibility (0..1, vignette + thinning). */
  portrait: Float32Array
  portraitColor: Float32Array
  portraitVis: Float32Array
  /** Datacenter LED / data-stream positions; `flow` is a travel vector (0 = static LED). */
  hall: Float32Array
  flow: Float32Array
  /** Dashboard plot anchors and (type, u, v, seed). */
  dash: Float32Array
  dashInfo: Float32Array
  /** Point cloud positions (world) and class ids. */
  cloud: Float32Array
  cloudClass: Float32Array
  /** City road network positions, travel vectors and road weight (0 local … 1 arterial). */
  city: Float32Array
  cityFlow: Float32Array
  cityWeight: Float32Array
}

/** Shared by the 3D photo mesh, so the photo burns away exactly where points appear. */
export const burnGlsl = /* glsl */ `
  float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    float a = bHash(i), b = bHash(i + vec2(1.0, 0.0)), c = bHash(i + vec2(0.0, 1.0)), d = bHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
  }
  /** uv with v = 0 at the bottom; the burn starts at the top of the head. */
  float burnField(vec2 uv) {
    float n = 0.6 * bNoise(uv * 7.0) + 0.4 * bNoise(uv * 19.0 + 3.1);
    return 0.5 * n + 0.5 * (1.0 - uv.y);
  }
`

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uScale;
  uniform float uDensity;
  uniform float uFogDensity;
  uniform vec3 uPointer;
  uniform float uPointerStrength;
  uniform float uScanY;
  uniform float uBurn;
  uniform vec3 uPortraitCenter;
  uniform float uPortraitSize;
  uniform float uHallFlow;
  uniform vec3 uGpu;
  uniform vec2 uDashSize;
  uniform float uCloudGround;
  uniform float uSweep;
  uniform float uSweepOn;
  uniform vec4 uSizes;   // portrait, hall, gpu, dash
  uniform vec3 uSizes2;  // cloud, city, globe
  uniform vec3 uDeep;
  uniform vec3 uCyan;
  uniform vec3 uIce;
  uniform vec3 uClassColors[5];
  uniform vec3 uGlobeCenter;
  uniform vec3 uEye;
  uniform vec2 uFocusExtent;
  uniform float uFocusAmount;
  uniform float uWarp;
  uniform vec3 uSunDir;
  uniform vec2 uCortex;      // x heat of the overloaded hosts, y scheduler activity
  uniform vec3 uCortexArea;  // x0, x1, front z of the scheduled racks
  uniform vec3 uHot[4];      // hot host centers
  uniform float uHotCount;

  attribute vec3 aColor;
  attribute vec3 aHall;
  attribute vec3 aFlow;
  attribute vec3 aDash;
  attribute vec4 aDashInfo;
  attribute vec3 aCloud;
  attribute float aClass;
  attribute vec3 aCity;
  attribute vec3 aCityFlow;
  attribute vec4 aGlobe;    // xyz world position, w = closeness to Dresden
  attribute vec2 aMisc;     // x portrait visibility, y city road weight
  attribute vec4 aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  const float PI = 3.14159265;
  float gTouch = 0.0;
  float gBurnEdge = 0.0;
  float gBurnVis = 1.0;

  ${burnGlsl}
  ${packetGlsl}
  ${loadRampGlsl}

  // ---------- 0 portrait ----------
  vec3 portraitPos() {
    vec3 p = position;
    vec2 uv = (p.xy - uPortraitCenter.xy) / uPortraitSize + 0.5;
    float d = burnField(uv);
    gBurnVis = smoothstep(d, d + 0.05, uBurn);
    gBurnEdge = exp(-pow((uBurn - d) / 0.04, 2.0));
    vec3 dp = p - uPointer;
    float r = length(dp.xy);
    float f = exp(-r * r * 3.5) * uPointerStrength;
    gTouch = f;
    float ripple = sin(r * 14.0 - uTime * 5.0) * 0.5 + 0.5;
    p.xy += normalize(dp.xy + 1e-5) * f * 0.06;
    p.z += f * (0.18 + 0.06 * ripple) + gBurnEdge * 0.25;
    p.z += sin(uTime * 1.3 + aSeed.x * 40.0) * 0.008;
    return p;
  }
  vec3 portraitColor() {
    float band = exp(-pow((position.y - uScanY) / 0.05, 2.0));
    float trail = exp(-max(0.0, position.y - uScanY) * 3.0) * step(uScanY, position.y) * 0.25;
    vec3 c = aColor * (1.0 + trail + gTouch * 0.9) + vec3(0.85, 0.95, 1.0) * band * 1.4 * aMisc.x;
    return c * gBurnVis + vec3(0.9, 0.95, 1.0) * gBurnEdge * 1.2;
  }

  // ---------- 1 hall ----------
  float flowPhase(float speed) { return fract(aSeed.x + uTime * speed); }
  float isFlow() { return step(1e-6, dot(aFlow, aFlow)); }
  vec3 hallPos() { return aHall + aFlow * flowPhase((0.035 + 0.07 * aSeed.y) * uHallFlow); }
  vec3 hallColor() {
    float tw = 0.45 + 0.55 * sin(uTime * (0.5 + aSeed.y * 2.5) + aSeed.x * 60.0);
    float blink = step(0.5, fract(uTime * (0.4 + aSeed.z) + aSeed.w * 7.0));
    tw = mix(tw, 0.2 + 0.8 * blink, step(0.86, aSeed.w));
    vec3 led = aSeed.w > 0.95 ? vec3(1.0) : mix(uCyan, uIce, aSeed.z);
    // Racks Cortex schedules onto: their LEDs blink busily while VMs land and move,
    // and the overloaded hosts glow amber until the rebalance cools them down.
    float inArea = step(abs(aHall.z - uCortexArea.z), 0.05) * step(uCortexArea.x, aHall.x) * step(aHall.x, uCortexArea.y);
    float hot = 0.0;
    for (int k = 0; k < 4; k++) {
      if (float(k) >= uHotCount) break;
      vec2 d = abs(aHall.xy - uHot[k].xy) / vec2(0.34, 0.075);
      hot = max(hot, 1.0 - smoothstep(0.7, 1.0, max(d.x, d.y)));
    }
    hot *= uCortex.x * inArea;
    float busy = max(uCortex.y * inArea, hot);
    float fast = step(0.45, fract(uTime * (2.5 + aSeed.z * 5.0) + aSeed.w * 7.0));
    tw = mix(tw, 0.25 + 0.75 * fast, busy);
    led = mix(led, PKT_HOT * 1.4, hot);
    led *= tw * (1.0 + 0.6 * busy);
    float ph = flowPhase((0.035 + 0.07 * aSeed.y) * uHallFlow);
    vec3 stream = packetColor(aFlow.x, fract(aSeed.w * 7.31 + aSeed.y * 3.17)) * 0.8 * smoothstep(0.0, 0.12, ph) * smoothstep(1.0, 0.85, ph);
    // Same center focus as the racks: LEDs and streams fade towards the sides of the hall.
    vec3 hp = hallPos();
    float focus = mix(1.0, 1.0 - smoothstep(0.38, 1.0, length(hp.xz / uFocusExtent)), uFocusAmount);
    return mix(led, stream, isFlow()) * focus;
  }

  // ---------- 2 gpu ----------
  vec3 gpuPos() {
    vec3 r = aSeed.xyz * 2.0 - 1.0;
    return uGpu + r * vec3(0.045, 0.006, 0.04);
  }
  vec3 gpuColor() { return vec3(0.55, 0.8, 1.0) * 0.45; }

  // ---------- 3 dashboards ----------
  float h1(float x) { return fract(sin(x * 91.17) * 43758.5453); }
  vec2 node(float j, float ps) {
    return vec2(0.08 + 0.84 * h1(j + ps * 13.0), 0.12 + 0.76 * h1(j * 3.7 + ps * 5.0))
      + 0.012 * vec2(sin(uTime * 0.7 + j), cos(uTime * 0.6 + j * 1.3));
  }
  vec3 dashPos(out vec3 col) {
    float type = aDashInfo.x;
    float u = aDashInfo.y;
    float v = aDashInfo.z;
    float s = aDashInfo.w;
    float ps = fract(sin(dot(aDash.xy, vec2(12.9898, 78.233))) * 437.585);
    vec2 W = uDashSize;
    vec2 q;
    if (type < 0.5) {
      // time series with a soft area fill
      float f = 0.5 + 0.26 * sin(u * 7.0 + uTime * 0.9 + ps * 20.0)
        + 0.13 * sin(u * 19.0 - uTime * 1.7 + ps * 7.0) + 0.05 * sin(u * 53.0 + uTime * 3.0);
      if (v < 0.5) {
        q = vec2(u, f + (v - 0.25) * 0.025);
        col = uIce * 1.1;
      } else {
        q = vec2(u, f * (v - 0.5) / 0.5);
        col = uCyan * 0.22;
      }
    } else if (type < 1.5) {
      // bars
      float nb = 16.0;
      float bar = floor(u * nb);
      float g = 0.15 + 0.75 * (0.5 + 0.5 * sin(bar * 1.7 + uTime * 0.8 + ps * 9.0));
      q = vec2((bar + 0.15 + 0.7 * fract(u * nb)) / nb, v * g);
      col = mix(uCyan * 0.35, uIce, v) * (0.6 + 0.6 * v);
    } else if (type < 2.5) {
      // node graph (the canvas panel that generates graphs from query data)
      float K = 12.0;
      vec2 pw;
      if (s < 0.3) {
        float j = floor(s / 0.3 * K);
        float a = u * 2.0 * PI;
        pw = node(j, ps) * W + 0.02 * sqrt(v) * vec2(cos(a), sin(a));
        col = vec3(0.9, 0.97, 1.0) * 1.2;
      } else {
        float e = floor((s - 0.3) / 0.7 * 20.0);
        float a = floor(h1(e * 1.31 + ps) * K);
        float b = floor(h1(e * 2.77 + ps + 0.5) * K);
        pw = mix(node(a, ps) * W, node(b, ps) * W, u);
        float pulse = exp(-pow(fract(u - uTime * 0.35 + h1(e)) * 12.0, 2.0));
        col = uCyan * 0.35 + vec3(0.85, 0.95, 1.0) * pulse * 1.6;
      }
      return vec3(aDash.xy + pw, aDash.z);
    } else {
      // heatmap
      float cx = floor(u * 24.0);
      float cy = floor(v * 8.0);
      q = vec2((cx + 0.12 + 0.76 * fract(u * 24.0)) / 24.0, (cy + 0.12 + 0.76 * fract(v * 8.0)) / 8.0);
      float I = 0.5 + 0.5 * sin(cx * 0.45 - uTime * 1.2 + cy * 1.1 + ps * 10.0) * sin(cy * 0.7 + uTime * 0.4 + cx * 0.13);
      col = loadRamp(I) * mix(0.55, 1.15, I);
    }
    return vec3(aDash.xy + q * W, aDash.z);
  }

  // ---------- 4 point cloud ----------
  vec3 cloudColor() {
    // Before the sweep: raw LiDAR returns in near-grey, brightness = reflectivity.
    // Cars and facades reflect strongly, foliage and asphalt weakly, plus speckle.
    // The sweep then paints the semantic classes on top, as a perception model would.
    float h = clamp((aCloud.y - uCloudGround) / 1.1, 0.0, 1.0);
    int k = int(aClass + 0.5);
    float refl = k == 1 ? 0.95 : k == 4 ? 0.75 : k == 2 ? 0.6 : k == 3 ? 0.4 : 0.32;
    float intensity = refl * (0.55 + 0.45 * aSeed.z) * (0.8 + 0.2 * h);
    vec3 raw = vec3(0.78, 0.85, 0.95) * intensity * 0.75;
    float swept = smoothstep(0.0, 0.08, uSweep - aCloud.x) * uSweepOn;
    vec3 cls = uClassColors[int(aClass + 0.5)] * 1.35;
    float front = exp(-pow((aCloud.x - uSweep) / 0.09, 2.0)) * uSweepOn;
    return mix(raw, cls, swept) + vec3(0.9, 0.97, 1.0) * front * 2.0;
  }

  // ---------- 5 city ----------
  float cityFlows() { return step(1e-6, dot(aCityFlow, aCityFlow)); }
  vec3 cityPos() { return aCity + aCityFlow * flowPhase(0.04 + 0.08 * aSeed.y); }
  vec3 cityColor() {
    float w = aMisc.y;
    vec3 road = mix(uDeep * 3.2 + uCyan * 0.18, uIce * 0.5, w * w);
    float ph = flowPhase(0.04 + 0.08 * aSeed.y);
    vec3 car = vec3(0.75, 0.9, 1.0) * 1.3 * smoothstep(0.0, 0.1, ph) * smoothstep(1.0, 0.9, ph);
    return mix(road * (0.7 + 0.3 * aSeed.z), car, cityFlows());
  }

  // ---------- 6 globe ----------
  vec3 globeColor() {
    vec3 world = uDeep * 2.2 + uCyan * 0.12;
    vec3 near = mix(uCyan, uIce, aSeed.z) * 1.05;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed.y) + aSeed.x * 40.0);
    vec3 n = normalize(aGlobe.xyz - uGlobeCenter);
    vec3 v = normalize(uEye - aGlobe.xyz);
    float facing = smoothstep(-0.05, 0.35, dot(n, v));
    // Night side: land dims and a sparse set of warm city lights comes on.
    float day = smoothstep(-0.15, 0.15, dot(n, uSunDir));
    float lights = (1.0 - day) * step(0.9, aSeed.w) * (0.7 + 0.3 * sin(uTime * (1.5 + aSeed.x * 3.0) + aSeed.y * 50.0));
    vec3 land = mix(world, near, aGlobe.w) * tw * mix(0.4, 1.0, day);
    // A thin warm line where the land crosses the terminator, live with the real sun.
    float term = exp(-pow(dot(n, uSunDir) / 0.035, 2.0));
    return (land + vec3(1.0, 0.72, 0.4) * (lights * 0.55 + term * 0.3)) * facing;
  }

  void stage(int i, out vec3 p, out vec3 c, out float s) {
    if (i == 0) { p = portraitPos(); c = portraitColor(); s = uSizes.x; }
    else if (i == 1) { p = hallPos(); c = hallColor(); s = uSizes.y * mix(1.0, 1.8, isFlow()); }
    else if (i == 2) { p = gpuPos(); c = gpuColor(); s = uSizes.z; }
    else if (i == 3) { p = dashPos(c); s = uSizes.w; }
    else if (i == 4) { p = aCloud; c = cloudColor(); s = uSizes2.x; }
    else if (i == 5) { p = cityPos(); c = cityColor(); s = uSizes2.y * mix(0.9, 1.15, aMisc.y); }
    else { p = aGlobe.xyz; c = globeColor(); s = uSizes2.z * mix(1.0, 1.2, aGlobe.w); }
  }

  void main() {
    float m = clamp(uMorph, 0.0, 6.0);
    int i = int(min(floor(m), 5.0));
    float t = m - float(i);
    vec3 A; vec3 B; vec3 cA; vec3 cB; float sA; float sB;
    stage(i, A, cA, sA);
    stage(i + 1, B, cB, sB);

    float delay = aSeed.z * 0.45;
    float lt = clamp((t - delay) / 0.55, 0.0, 1.0);
    float e = lt * lt * (3.0 - 2.0 * lt);
    vec3 p = mix(A, B, e);
    float arc = sin(PI * e);
    vec3 swirl = vec3(
      sin(aSeed.x * 6.283 + uTime * 0.7 + aSeed.w * 9.0),
      sin(aSeed.y * 6.283 + uTime * 0.6 + aSeed.x * 9.0),
      cos(aSeed.w * 6.283 + uTime * 0.5 + aSeed.y * 9.0)
    );
    // Swirl and lift scale with the distance travelled, so every zoom level feels alike.
    float travel = length(B - A);
    float amp = travel * (i == 1 ? 0.06 : 0.09);
    p += swirl * arc * amp;
    p.y += arc * travel * (i == 0 ? 0.0 : 0.12);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Scroll-velocity warp: points scatter along the view axis and drift away
    // from the screen center, like light streaks during a fast flight.
    float wj = aSeed.y - 0.5;
    mv.z += wj * uWarp * max(0.001, -mv.z) * 0.18;
    mv.xy *= 1.0 + uWarp * 0.05 * aSeed.w;
    float dist = max(0.001, -mv.z);
    // Depth cue for the dense scenes (hall, point cloud): points behind the camera's
    // focus get smaller and lose saturation, like aerial perspective. The fog density
    // is 0.35 / focus distance (cameraRig), so this ratio is depth relative to focus.
    float cue = clamp(1.0 - abs(m - 1.0), 0.0, 1.0) + clamp(1.0 - abs(m - 4.0), 0.0, 1.0);
    float far = smoothstep(1.0, 2.6, uFogDensity * dist / 0.35) * cue;
    float size = mix(sA, sB, e) * uDensity * uScale / dist * (1.0 + 0.45 * uWarp) * (1.0 - 0.35 * far);
    float alpha = 1.0;
    if (size < 1.2) { alpha = size / 1.2; size = 1.2; }
    // Particles passing right in front of the lens fade out instead of blowing up.
    alpha *= smoothstep(0.06, 0.5, dist);
    gl_PointSize = min(size, 14.0);
    gl_Position = projectionMatrix * mv;

    // Portrait thinning: hidden portrait points fade in as they fly away.
    float vis = i == 0 ? mix(aMisc.x, 1.0, e) : 1.0;

    float fog = exp(-pow(uFogDensity * dist, 2.0));
    vec3 c = mix(cA, cB, e) * (1.0 + arc * 0.3) * (1.0 - 0.45 * arc * step(1.0, m) * step(m, 3.0));
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(lum) * vec3(0.78, 0.86, 1.0), 0.7 * far);
    vColor = c * fog * vis * (1.0 + 0.35 * uWarp);
    vAlpha = alpha;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c) * 4.0;
    if (r > 1.0) discard;
    float a = exp(-r * 2.6) * vAlpha;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`

/**
 * A single point set that carries the whole story:
 *   0 portrait → 1 datacenter LEDs → 2 GPU core → 3 dashboards
 *   → 4 classified point cloud → 5 city road network → 6 globe.
 * Transitions are per-particle staggered and swirled so they read as
 * "data flowing", never as a cross-fade.
 */
export class MorphParticles {
  readonly points: Points
  readonly material: ShaderMaterial
  private globeAttr: BufferAttribute

  constructor(t: MorphTargets, globeCenter: Vector3) {
    const g = new BufferGeometry()
    const n = t.count
    g.setAttribute('position', new BufferAttribute(t.portrait, 3))
    g.setAttribute('aColor', new BufferAttribute(t.portraitColor, 3))
    g.setAttribute('aHall', new BufferAttribute(t.hall, 3))
    g.setAttribute('aFlow', new BufferAttribute(t.flow, 3))
    g.setAttribute('aDash', new BufferAttribute(t.dash, 3))
    g.setAttribute('aDashInfo', new BufferAttribute(t.dashInfo, 4))
    g.setAttribute('aCloud', new BufferAttribute(t.cloud, 3))
    g.setAttribute('aClass', new BufferAttribute(t.cloudClass, 1))
    g.setAttribute('aCity', new BufferAttribute(t.city, 3))
    g.setAttribute('aCityFlow', new BufferAttribute(t.cityFlow, 3))
    const misc = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      misc[i * 2] = t.portraitVis[i]
      misc[i * 2 + 1] = t.cityWeight[i]
    }
    g.setAttribute('aMisc', new BufferAttribute(misc, 2))
    // Globe targets are filled in later (the land mask loads lazily).
    const globe = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      globe[i * 4] = globeCenter.x
      globe[i * 4 + 1] = globeCenter.y
      globe[i * 4 + 2] = globeCenter.z
    }
    this.globeAttr = new BufferAttribute(globe, 4)
    g.setAttribute('aGlobe', this.globeAttr)
    const seed = new Float32Array(n * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    g.setAttribute('aSeed', new BufferAttribute(seed, 4))

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uScale: { value: 1 },
        // Point-size factor for sparser clouds (see densityComp in core/quality.ts).
        uDensity: { value: 1 },
        uFogDensity: shared.uFogDensity,
        uPointer: { value: new Vector3(0, 0, 100) },
        uPointerStrength: { value: 0 },
        uScanY: { value: 0 },
        uBurn: { value: 0 },
        uPortraitCenter: { value: PORTRAIT_CENTER.clone() },
        uPortraitSize: { value: PORTRAIT_SIZE },
        uHallFlow: { value: 1 },
        uGpu: { value: new Vector3() },
        uDashSize: { value: new Vector2(DASH.inner.w, DASH.inner.h) },
        uCloudGround: { value: 0 },
        uSweep: { value: -100 },
        uSweepOn: { value: 0 },
        uSizes: { value: new Vector4(0.016, 0.007, 0.003, 0.0042) },
        uSizes2: { value: new Vector3(0.018, 0.45, 5) },
        uDeep: { value: palette.deep },
        uCyan: { value: palette.cyan },
        uIce: { value: palette.ice },
        uClassColors: { value: classes.map((c) => c.color) },
        uGlobeCenter: { value: globeCenter.clone() },
        uEye: { value: new Vector3() },
        uFocusExtent: shared.uFocusExtent,
        uFocusAmount: shared.uFocusAmount,
        uWarp: { value: 0 },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uCortex: { value: new Vector2() },
        uCortexArea: { value: new Vector3(0, 0, -1000) },
        uHot: { value: [0, 1, 2, 3].map(() => new Vector3(0, -1000, 0)) },
        uHotCount: { value: 0 },
      },
    })

    this.points = new Points(g, this.material)
    this.points.frustumCulled = false
  }

  /** Upload globe positions (xyz) + closeness to Dresden (w). */
  setGlobe(data: Float32Array) {
    ;(this.globeAttr.array as Float32Array).set(data)
    this.globeAttr.needsUpdate = true
  }

  get u() {
    return this.material.uniforms
  }
}
