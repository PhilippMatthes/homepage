import { Color, ShaderMaterial } from 'three'
import { palette, shade } from '../core/palette'
import { U } from '../world/layout'
import { shared } from '../core/shared'

export interface HoloOptions {
  fill?: Color
  edge?: Color
  /** Edge line width in pixels. */
  edgeWidth?: number
  /** Draw 1U slot lines on +z faces. */
  slots?: boolean
  /** Draw architectural panel lines (world-space grid) on every face. */
  panels?: number
  /** Fade out towards the sides of the hall (elliptical falloff around the origin). */
  focus?: boolean
  transparent?: boolean
  fillAlpha?: number
  glow?: number
  /** Lit window specks on the side walls (cell size in meters), as if full of racks. */
  windows?: number
}

/**
 * "Blueprint glass" for every solid in the scene: dark translucent fill,
 * pixel-constant glowing edges (from face UVs), fresnel rim, optional
 * rack-unit slot lines, and fog. Works for Mesh and InstancedMesh.
 */
export function holoMaterial(o: HoloOptions = {}) {
  const m = new ShaderMaterial({
    transparent: o.transparent ?? false,
    depthWrite: true,
    defines: { SLOTS: o.slots ? 1 : 0, PANELS: o.panels ? 1 : 0, FOCUS: o.focus ? 1 : 0, WINDOWS: o.windows ? 1 : 0 },
    uniforms: {
      // Not cloned: palette colors (and shade()s of them) are live and follow the section palette.
      uFill: { value: o.fill ?? shade(palette.deep, 0.4) },
      uEdge: { value: o.edge ?? palette.cyan },
      uEdgeWidth: { value: o.edgeWidth ?? 1.0 },
      uFillAlpha: { value: o.fillAlpha ?? 1 },
      uEdgeAlpha: { value: 1 },
      uGlow: { value: o.glow ?? 1 },
      uVisible: { value: 1 },
      uBg: { value: palette.bg },
      uFogDensity: shared.uFogDensity,
      uPanel: { value: o.panels ?? 1 },
      uWin: { value: o.windows ?? 1 },
      uFocusExtent: shared.uFocusExtent,
      uFocusAmount: shared.uFocusAmount,
      uU: { value: U },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vUv = uv;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFill;
      uniform vec3 uEdge;
      uniform float uEdgeWidth;
      uniform float uFillAlpha;
      uniform float uEdgeAlpha;
      uniform float uGlow;
      uniform float uVisible;
      uniform vec3 uBg;
      uniform float uFogDensity;
      uniform float uU;
      uniform float uTime;
      uniform float uPanel;
      uniform float uWin;
      uniform vec2 uFocusExtent;
      uniform float uFocusAmount;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;

      void main() {
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float fw = max(fwidth(e), 1e-5);
        float edge = 1.0 - smoothstep(fw * uEdgeWidth * 0.5, fw * (uEdgeWidth + 0.5), e);

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - abs(dot(V, vN)), 3.0);

        vec3 col = uFill + uEdge * fres * 0.25;
        float slot = 0.0;
        #if SLOTS == 1
          float sy = vW.y / uU;
          float fy = fwidth(sy);
          float s = fract(sy);
          slot = (1.0 - smoothstep(0.0, fy * 1.2, min(s, 1.0 - s)));
          slot *= step(0.5, vN.z) * (1.0 - smoothstep(0.12, 0.4, fy));
          col += uEdge * slot * 0.18;
        #endif
        #if PANELS == 1
          vec3 an = abs(vN);
          vec2 q = an.y > 0.5 ? vW.xz : (an.x > 0.5 ? vW.zy : vW.xy);
          vec2 g = q / uPanel;
          vec2 gw = fwidth(g);
          vec2 gl = abs(fract(g - 0.5) - 0.5) / max(gw, 1e-5);
          float panel = (1.0 - min(min(gl.x, gl.y), 1.0)) * (1.0 - smoothstep(0.2, 0.6, max(gw.x, gw.y)));
          col += uEdge * panel * 0.22;
          edge = max(edge, panel * 0.35);
        #endif
        #if WINDOWS == 1
          // Walls: lit windows. Roof: rack LEDs glimmering through the glass, in rows.
          vec3 wn = abs(vN);
          bool roof = wn.y > 0.5;
          vec2 wsz = roof ? vec2(uWin * 0.5, uWin * 1.4) : vec2(uWin, uWin * 0.55);
          vec2 wq = (roof ? vW.xz : (wn.x > 0.5 ? vW.zy : vW.xy)) / wsz;
          vec2 cell = floor(wq);
          vec2 f = fract(wq) - 0.5;
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float on = step(roof ? 0.6 : 0.42, h) * (0.55 + 0.45 * sin(uTime * (0.6 + 2.0 * h) + h * 40.0));
          float speck = (1.0 - smoothstep(0.16, 0.28, abs(f.x))) * (1.0 - smoothstep(0.1, 0.2, abs(f.y)));
          // Not in the plinth, and only while the specks resolve.
          float band = (roof ? 1.0 : step(0.35, vW.y) * step(vW.y, 2.9)) * (1.0 - smoothstep(0.2, 0.45, max(fwidth(wq.x), fwidth(wq.y))));
          col += mix(uEdge, vec3(1.0), 0.35) * speck * on * band * (roof ? 0.6 : 0.9);
        #endif
        col += uEdge * edge * uGlow;

        float dist = length(cameraPosition - vW);
        float fog = exp(-pow(uFogDensity * dist, 2.0));
        float a = max(uFillAlpha, edge * uEdgeAlpha);
        float vis = uVisible;
        #if FOCUS == 1
          // Elliptical falloff towards the sides of the hall: focus on the center.
          float r = length(vW.xz / uFocusExtent);
          vis *= mix(1.0, 1.0 - smoothstep(0.38, 1.0, r), uFocusAmount);
        #endif
        col = mix(uBg, col, fog * vis);
        gl_FragColor = vec4(col, a * vis);
      }
    `,
  })
  return m
}

/** Applies a 0..1 see-through amount to a transparent holo material. */
export function setHoloFade(m: ShaderMaterial, visible: number, fill: number) {
  m.uniforms.uVisible.value = visible
  m.uniforms.uFillAlpha.value = fill
  m.depthWrite = fill > 0.9
}
