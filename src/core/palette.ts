import { Color, SRGBColorSpace } from 'three'

/**
 * Shared color language, one palette per section of the page:
 *   blue   – cover and apps
 *   purple – the datacenter (cloud, Cortex, agents, dashboards)
 *   green  – machine learning and PrioBike
 *   gold   – the globe and contact
 * Scrolling blends between them, so every color below is live: `palette.*`
 * Colors are updated in place each frame (see applyTheme), and shaders read
 * them through `themeUniforms` / `themeGlsl` instead of literals.
 *
 * Within a palette, the primary ramp (deep → blue → cyan → ice) is data at
 * rest, and `amber` is that palette's accent: something is happening (hot
 * hosts, GPU-bound work, agent gates, arriving packets). Keep it rare so it
 * keeps meaning "look here".
 */

/** sRGB hex, or `[r, g, b]` in linear light (as a shader literal would be written). */
type C = string | [number, number, number]

interface Theme {
  bg: C
  /** Darkest primary: panel fills and the bottom of the portrait. */
  deep: C
  blue: C
  cyan: C
  ice: C
  /** The accent ("look here"). */
  amber: C
  /** Near-white highlight with a hint of the primary (scan lines, flashes, ingress packets). */
  spark: C
  /** Bright saturated primary for glows (egress packets, edges, the GPU). */
  glow: C
  /** Desaturated light for raw sensor data and distant points. */
  haze: C
  /** Portrait duotone mid tone. */
  mid: C
  /** Dashboard panel fill. */
  panel: C
  /** The load ramp, low to high (the top is the accent). */
  ramp: [C, C, C, C]
  ui: { accent: string; ink: string; muted: string; lead: string; body: string; titleEnd: string; panel: string; panelHi: string }
}

const BLUE: Theme = {
  bg: '#02040a',
  deep: '#0a1a3f',
  blue: '#1d4ed8',
  cyan: '#3fa9ff',
  ice: '#9fd8ff',
  amber: '#ffb35c',
  spark: [0.88, 0.95, 1.0],
  glow: [0.3, 0.72, 1.0],
  haze: [0.78, 0.86, 1.0],
  mid: [0.22, 0.25, 0.31],
  panel: [0.02, 0.05, 0.12],
  ramp: [[0.06, 0.14, 0.42], [0.25, 0.66, 1.0], [0.72, 0.9, 1.0], [1.0, 0.7, 0.36]],
  ui: { accent: '#3fa9ff', ink: '#e8f2ff', muted: '#8aa4c8', lead: '#b9cbe6', body: '#a3b8d6', titleEnd: '#9fc6ff', panel: '#060e20', panelHi: '#141e46' },
}

/** Violet with a hot pink accent. */
const PURPLE: Theme = {
  bg: '#05020c',
  deep: '#1f0b4d',
  blue: '#6d28d9',
  cyan: '#a855f7',
  ice: '#dcc2ff',
  amber: '#ff4fa3',
  spark: [0.93, 0.86, 1.0],
  glow: [0.55, 0.25, 1.0],
  haze: [0.85, 0.8, 1.0],
  mid: [0.24, 0.21, 0.31],
  panel: [0.05, 0.02, 0.13],
  ramp: [[0.1, 0.03, 0.4], [0.45, 0.18, 1.0], [0.82, 0.68, 1.0], [1.0, 0.12, 0.45]],
  ui: { accent: '#b57bff', ink: '#f1eaff', muted: '#a395c8', lead: '#cfc2ec', body: '#b9acd9', titleEnd: '#d7b8ff', panel: '#110826', panelHi: '#26104e' },
}

/** Emerald and mint with a coral accent. */
const GREEN: Theme = {
  bg: '#010805',
  deep: '#063a2a',
  blue: '#059669',
  cyan: '#22e39a',
  ice: '#b4ffdc',
  amber: '#ff6f61',
  spark: [0.85, 1.0, 0.92],
  glow: [0.15, 1.0, 0.55],
  haze: [0.8, 0.95, 0.86],
  mid: [0.2, 0.27, 0.24],
  panel: [0.01, 0.08, 0.05],
  ramp: [[0.0, 0.18, 0.12], [0.1, 0.85, 0.45], [0.7, 1.0, 0.85], [1.0, 0.25, 0.2]],
  ui: { accent: '#2ee6a0', ink: '#eafff5', muted: '#8fbfa8', lead: '#c0e6d4', body: '#a8d4bf', titleEnd: '#9ff5cf', panel: '#04170f', panelHi: '#0b3424' },
}

/** Amber gold with an electric cyan accent. */
const GOLD: Theme = {
  bg: '#080502',
  deep: '#3a2405',
  blue: '#b7791f',
  cyan: '#ffb000',
  ice: '#ffe2a0',
  amber: '#3ad8ff',
  spark: [1.0, 0.93, 0.78],
  glow: [1.0, 0.62, 0.1],
  haze: [1.0, 0.92, 0.78],
  mid: [0.29, 0.25, 0.18],
  panel: [0.1, 0.06, 0.01],
  ramp: [[0.35, 0.15, 0.0], [1.0, 0.5, 0.0], [1.0, 0.85, 0.5], [0.1, 0.75, 1.0]],
  ui: { accent: '#ffbf3c', ink: '#fff6e6', muted: '#c8b28a', lead: '#ecdcb8', body: '#d9c59e', titleEnd: '#ffd77a', panel: '#1a1206', panelHi: '#3a280c' },
}

/** Where each palette holds (scroll progress); in between, neighbours blend. */
const KEYS: Array<{ p: number; theme: Theme }> = [
  { p: 0.0, theme: BLUE },
  { p: 0.135, theme: BLUE }, // the app screen rains onto the datacenter...
  { p: 0.195, theme: PURPLE }, // ...which is purple by the time it lands
  { p: 0.69, theme: PURPLE }, // dashboards burst into the point cloud
  { p: 0.73, theme: GREEN },
  { p: 0.93, theme: GREEN }, // the city zooms out to the globe
  { p: 0.965, theme: GOLD },
  { p: 1.0, theme: GOLD },
]

const col = (c: C) => (typeof c === 'string' ? new Color(c) : new Color().setRGB(c[0], c[1], c[2]))

const TOKENS = ['bg', 'deep', 'blue', 'cyan', 'ice', 'amber', 'spark', 'glow', 'haze', 'mid', 'panel'] as const
const UI = ['accent', 'ink', 'muted', 'lead', 'body', 'titleEnd', 'panel', 'panelHi'] as const
type Token = (typeof TOKENS)[number]
type UiToken = (typeof UI)[number]

interface Resolved {
  c: Record<Token, Color>
  ramp: Color[]
  ui: Record<UiToken, Color>
}
const resolve = (t: Theme): Resolved => ({
  c: Object.fromEntries(TOKENS.map((k) => [k, col(t[k])])) as Record<Token, Color>,
  ramp: t.ramp.map(col),
  ui: Object.fromEntries(UI.map((k) => [k, new Color(t.ui[k])])) as Record<UiToken, Color>,
})
const resolved = new Map<Theme, Resolved>([BLUE, PURPLE, GREEN, GOLD].map((t) => [t, resolve(t)]))
const first = resolved.get(BLUE)!

/** The live palette. Starts as the cover's (blue); colors baked at load time use that. */
export const palette = {
  ...(Object.fromEntries(TOKENS.map((k) => [k, first.c[k].clone()])) as Record<Token, Color>),
  white: new Color('#ffffff'),
  /** The current section's UI accent. */
  accent: first.ui.accent.clone(),
  /** Backdrop room tint behind the cover portrait (only ever seen in blue). */
  room: [0.8, 0.92, 1.1] as const,
}
const ramp = first.ramp.map((c) => c.clone())
const ui = Object.fromEntries(UI.map((k) => [k, first.ui[k].clone()])) as Record<UiToken, Color>

/** The accent as the load ramp tops out (in blue a little softer than `palette.amber`). */
export const hot = ramp[3]

/**
 * Uniforms for the live theme colors. Spread them into a ShaderMaterial's
 * uniforms and put `themeGlsl` into the shader stage that uses them.
 */
export const themeUniforms = {
  uThSpark: { value: palette.spark },
  uThGlow: { value: palette.glow },
  uThHaze: { value: palette.haze },
  uThMid: { value: palette.mid },
  uThPanel: { value: palette.panel },
  uThHot: { value: hot },
  uThRamp0: { value: ramp[0] },
  uThRamp1: { value: ramp[1] },
  uThRamp2: { value: ramp[2] },
}
export const themeGlsl = /* glsl */ `
  #ifndef THEME_UNIFORMS
  #define THEME_UNIFORMS
  uniform vec3 uThSpark;
  uniform vec3 uThGlow;
  uniform vec3 uThHaze;
  uniform vec3 uThMid;
  uniform vec3 uThPanel;
  uniform vec3 uThHot;
  uniform vec3 uThRamp0;
  uniform vec3 uThRamp1;
  uniform vec3 uThRamp2;
  #endif
`

/** Point cloud classes (only seen in the green section): road, vehicle, pedestrian, vegetation, structure. */
const CLASS_NAMES = ['road', 'vehicle', 'pedestrian', 'vegetation', 'structure'] as const
const CLASS_COLORS = ['#1d5a44', '#4cc9ff', '#ff6f61', '#c6f35e', '#7fa596']
export const classes = CLASS_NAMES.map((name, i) => ({ name, color: new Color(CLASS_COLORS[i]) }))

export type ClassId = 0 | 1 | 2 | 3 | 4

/** Live colors derived from a palette color, kept up to date by applyTheme. */
const derived: Array<{ src: Color; k: number; out: Color }> = []
const srgb = { r: 0, g: 0, b: 0 }
function shadeInto(src: Color, k: number, out: Color) {
  src.getRGB(srgb, SRGBColorSpace)
  return out.setRGB(Math.min(1, srgb.r * k), Math.min(1, srgb.g * k), Math.min(1, srgb.b * k), SRGBColorSpace)
}

/** `c` darkened by `k` in sRGB (as if its hex digits were scaled), for panel fills. Live. */
export function shade(c: Color, k: number) {
  const out = shadeInto(c, k, new Color())
  derived.push({ src: c, k, out })
  return out
}

/** CSS `rgba()` for a color. */
export function css(c: Color, a = 1) {
  c.getRGB(srgb, SRGBColorSpace)
  return `rgba(${Math.round(srgb.r * 255)}, ${Math.round(srgb.g * 255)}, ${Math.round(srgb.b * 255)}, ${a})`
}

/**
 * One sequential ramp for every "how busy is this" value (host heat, GPU load,
 * dashboard heatmaps): deep → cyan → ice → accent at the very top.
 */
const STOPS = [0, 0.4, 0.75, 1]
export function loadRamp(t: number, out = new Color()) {
  t = Math.min(1, Math.max(0, t))
  let i = 0
  while (i < STOPS.length - 2 && t > STOPS[i + 1]) i++
  return out.copy(ramp[i]).lerp(ramp[i + 1], (t - STOPS[i]) / (STOPS[i + 1] - STOPS[i]))
}

export const loadRampGlsl = /* glsl */ `
  ${themeGlsl}
  vec3 loadRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.4) return mix(uThRamp0, uThRamp1, t / 0.4);
    if (t < 0.75) return mix(uThRamp1, uThRamp2, (t - 0.4) / 0.35);
    return mix(uThRamp2, uThHot, (t - 0.75) / 0.25);
  }
`

const smooth = (x: number) => x * x * (3 - 2 * x)
const lastCss = new Map<string, string>()
const meta = typeof document === 'undefined' ? null : document.querySelector('meta[name="theme-color"]')
let lastP = NaN

/** Blends the section palettes for scroll progress `p` into the live palette and the CSS variables. */
export function applyTheme(p: number, root: HTMLElement) {
  if (p === lastP) return palette.bg
  lastP = p
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
  const a = resolved.get(KEYS[i].theme)!
  const b = resolved.get(KEYS[i + 1].theme)!
  const span = KEYS[i + 1].p - KEYS[i].p
  const t = a === b || span <= 0 ? 0 : smooth(Math.min(1, Math.max(0, (p - KEYS[i].p) / span)))
  for (const k of TOKENS) palette[k].copy(a.c[k]).lerp(b.c[k], t)
  ramp.forEach((c, j) => c.copy(a.ramp[j]).lerp(b.ramp[j], t))
  for (const k of UI) ui[k].copy(a.ui[k]).lerp(b.ui[k], t)
  palette.accent.copy(ui.accent)
  for (const d of derived) shadeInto(d.src, d.k, d.out)

  const hex = (c: Color) => `#${c.getHexString()}`
  const set = (name: string, value: string) => {
    if (lastCss.get(name) === value) return
    lastCss.set(name, value)
    root.style.setProperty(name, value)
  }
  set('--bg', hex(palette.bg))
  set('--cyan', hex(palette.cyan))
  set('--ice', hex(palette.ice))
  set('--spark', hex(palette.spark))
  set('--line', css(palette.ice, 0.18))
  set('--accent', hex(ui.accent))
  set('--ink', hex(ui.ink))
  set('--muted', hex(ui.muted))
  set('--lead', hex(ui.lead))
  set('--body', hex(ui.body))
  set('--title-end', hex(ui.titleEnd))
  set('--panel', hex(ui.panel))
  set('--panel-hi', hex(ui.panelHi))
  const bg = hex(palette.bg)
  if (meta && meta.getAttribute('content') !== bg) meta.setAttribute('content', bg)
  return palette.bg
}
