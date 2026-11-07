import { Color, ShaderMaterial } from 'three'
import { palette } from '../core/palette'
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
    defines: { SLOTS: o.slots ? 1 : 0, PANELS: o.panels ? 1 : 0, FOCUS: o.focus ? 1 : 0 },
    uniforms: {
      uFill: { value: (o.fill ?? new Color('#040a18')).clone() },
      uEdge: { value: (o.edge ?? palette.cyan).clone() },
      uEdgeWidth: { value: o.edgeWidth ?? 1.0 },
      uFillAlpha: { value: o.fillAlpha ?? 1 },
      uEdgeAlpha: { value: 1 },
      uGlow: { value: o.glow ?? 1 },
      uVisible: { value: 1 },
      uBg: { value: palette.bg },
      uFogDensity: shared.uFogDensity,
      uPanel: { value: o.panels ?? 1 },
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
