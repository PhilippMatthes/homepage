import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { palette, shade } from '../core/palette'
import { shared } from '../core/shared'
import { holoMaterial, setHoloFade } from '../fx/holoMaterial'
import {
  CEILING_Y,
  HALL,
  SERVER,
  TARGET,
  RACK,
  RACKS_PER_ROW,
  ROW_LENGTH,
  ROW_PITCH,
  ROWS,
  U,
  rackX,
  rowZ,
} from '../world/layout'

/**
 * Positions for the shared particles when they act as datacenter lights:
 * status LEDs on rack fronts/backs, plus streams of data running along the
 * floor aisles and overhead cable trays.
 */
export function hallTargets(count: number) {
  const pos = new Float32Array(count * 3)
  const flow = new Float32Array(count * 3)
  const nLed = Math.floor(count * 0.6)
  const nFloor = Math.floor(count * 0.2)
  const halfLen = ROW_LENGTH / 2 + 0.6

  for (let i = 0; i < count; i++) {
    const o = i * 3
    if (i < nLed) {
      const k = Math.floor(Math.random() * ROWS)
      const c = Math.floor(Math.random() * RACKS_PER_ROW)
      const front = Math.random() < 0.7
      // Keep the target server's slot dark so it can slide out cleanly.
      if (k === TARGET.row && c === TARGET.col && front) { i--; continue }
      // LEDs cluster on the right edge of each server (status column), some spread.
      const slot = 1 + Math.floor(Math.random() * 40)
      const col = Math.random() < 0.6 ? 0.42 + Math.random() * 0.05 : Math.random() * 0.4 - 0.2
      pos[o] = rackX(c) + col * RACK.w * (front ? 1 : -1) * 0.95
      pos[o + 1] = slot * U + U * (0.3 + 0.4 * Math.random())
      pos[o + 2] = rowZ(k) + (front ? 1 : -1) * (RACK.d / 2 + 0.004)
    } else if (i < nLed + nFloor) {
      // Floor streams along the cold aisles (in front of each row).
      const k = Math.floor(Math.random() * ROWS)
      const lane = (Math.floor(Math.random() * 3) - 1) * 0.18
      const dir = Math.random() < 0.5 ? 1 : -1
      const len = 1.5 + Math.random() * 3.5
      const start = (Math.random() * 2 - 1) * (halfLen - len / 2) - (dir * len) / 2
      pos[o] = start
      pos[o + 1] = 0.006
      pos[o + 2] = rowZ(k) + RACK.d / 2 + (ROW_PITCH - RACK.d) / 2 + lane
      flow[o] = dir * len
    } else {
      // Overhead cable trays: one per row, streams run along them.
      const k = Math.floor(Math.random() * ROWS)
      const dir = Math.random() < 0.5 ? 1 : -1
      const len = 1 + Math.random() * 4
      const start = (Math.random() * 2 - 1) * (halfLen - len / 2) - (dir * len) / 2
      pos[o] = start
      pos[o + 1] = CEILING_Y + 0.05 + (Math.random() - 0.5) * 0.06
      pos[o + 2] = rowZ(k) + (Math.random() - 0.5) * 0.2
      flow[o] = dir * len
    }
  }
  return { pos, flow }
}

function floorMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: palette.cyan },
      uDeep: { value: palette.deep },
      uVisible: { value: 0 },
      uFogDensity: shared.uFogDensity,
      uPitch: { value: ROW_PITCH },
      uTime: { value: 0 },
      uFocusExtent: shared.uFocusExtent,
      uFocusAmount: shared.uFocusAmount,
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uDeep;
      uniform float uVisible;
      uniform float uFogDensity;
      uniform float uTime;
      uniform vec2 uFocusExtent;
      uniform float uFocusAmount;
      varying vec3 vW;
      float grid(vec2 p, float scale) {
        vec2 g = p / scale;
        vec2 fw = fwidth(g);
        vec2 l = abs(fract(g - 0.5) - 0.5) / max(fw, 1e-5);
        float line = 1.0 - min(min(l.x, l.y), 1.0);
        return line * (1.0 - smoothstep(0.15, 0.5, max(fw.x, fw.y)));
      }
      void main() {
        float tiles = grid(vW.xz, 0.6);
        float d = length(cameraPosition - vW);
        float fog = exp(-pow(uFogDensity * d, 2.0));
        float radial = exp(-dot(vW.xz, vW.xz) * 0.004);
        vec3 c = uDeep * 0.35 * radial + uColor * tiles * 0.16;
        float edge = 1.0 - smoothstep(18.0, 38.0, max(abs(vW.x), abs(vW.z)));
        float focus = mix(1.0, 1.0 - smoothstep(0.45, 1.15, length(vW.xz / uFocusExtent)), uFocusAmount);
        tiles *= focus;
        float a = (0.85 + tiles * 0.15) * fog * uVisible * edge;
        gl_FragColor = vec4(c * fog, a);
      }
    `,
  })
}

/** The procedural hall: racks, floor grid, cable trays, and the building around it. */
export class Datacenter {
  readonly group = new Group()
  readonly rackMat = holoMaterial({ slots: true, edgeWidth: 1.2, glow: 0.9, transparent: true, focus: true })
  readonly trayMat = holoMaterial({ fill: shade(palette.deep, 0.3), edge: palette.blue, glow: 0.7, transparent: true, focus: true })
  readonly floorMat = floorMaterial()
  readonly shellMat = holoMaterial({
    transparent: true,
    panels: 1.2,
    edgeWidth: 1.6,
    fill: shade(palette.deep, 0.45),
    edge: palette.cyan,
    glow: 1.1,
  })
  readonly roofUnitMat = holoMaterial({ transparent: true, fill: shade(palette.deep, 0.62), edge: palette.ice, glow: 0.9 })
  readonly racks: InstancedMesh
  private shell = new Group()

  constructor() {
    const geo = new BoxGeometry(RACK.w, RACK.h, RACK.d)
    this.racks = new InstancedMesh(geo, this.rackMat, ROWS * RACKS_PER_ROW)
    this.racks.renderOrder = -3
    const m = new Matrix4()
    let n = 0
    for (let k = 0; k < ROWS; k++) {
      for (let i = 0; i < RACKS_PER_ROW; i++) {
        if (k === TARGET.row && i === TARGET.col) {
          // The target rack is built from parts so its server slot is a real opening.
          m.makeScale(0, 0, 0)
        } else {
          m.makeTranslation(rackX(i), RACK.h / 2, rowZ(k))
        }
        this.racks.setMatrixAt(n++, m)
      }
    }
    this.racks.instanceMatrix.needsUpdate = true
    this.racks.computeBoundingSphere()
    this.group.add(this.racks)
    this.group.add(this.buildTargetRack())

    const trays = new InstancedMesh(new BoxGeometry(ROW_LENGTH + 1.2, 0.04, 0.3), this.trayMat, ROWS)
    trays.renderOrder = -3
    for (let k = 0; k < ROWS; k++) {
      m.makeTranslation(0, CEILING_Y, rowZ(k))
      trays.setMatrixAt(k, m)
    }
    trays.computeBoundingSphere()
    this.group.add(trays)

    const floor = new Mesh(new PlaneGeometry(80, 80), this.floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.renderOrder = -2
    this.group.add(floor)

    this.buildShell()
    this.group.add(this.shell)
  }

  private buildTargetRack() {
    const g = new Group()
    const x = rackX(TARGET.col)
    const z = rowZ(TARGET.row)
    const slotBottom = SERVER.slot * U
    const slotTop = slotBottom + U
    const part = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), this.rackMat)
      mesh.position.set(px, py, pz)
      mesh.renderOrder = -3
      g.add(mesh)
    }
    part(RACK.w, slotBottom, RACK.d, x, slotBottom / 2, z)
    part(RACK.w, RACK.h - slotTop, RACK.d, x, (slotTop + RACK.h) / 2, z)
    for (const side of [-1, 1]) {
      part(RACK.wall, U, RACK.d, x + side * (RACK.w - RACK.wall) / 2, slotBottom + U / 2, z)
    }
    part(RACK.w - 2 * RACK.wall, U, 0.04, x, slotBottom + U / 2, z - RACK.d / 2 + 0.02)
    return g
  }

  /** Walls, roof and rooftop units. They fade away as the camera descends into the hall. */
  private buildShell() {
    const { halfX, halfZ, height } = HALL
    const t = 0.08
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number, mat = this.shellMat) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      mesh.renderOrder = 1
      this.shell.add(mesh)
    }
    wall(2 * halfX, t, 2 * halfZ, 0, height, 0) // roof
    wall(2 * halfX, height, t, 0, height / 2, -halfZ)
    wall(2 * halfX, height, t, 0, height / 2, halfZ)
    wall(t, height, 2 * halfZ, -halfX, height / 2, 0)
    wall(t, height, 2 * halfZ, halfX, height / 2, 0)
    // Rooftop cooling units in a grid.
    for (let i = -1; i <= 1; i++) {
      for (let j = -3; j <= 3; j++) {
        wall(1.6, 0.5, 1.4, i * 3.6, height + 0.29, j * 3.4, this.roofUnitMat)
      }
    }
  }

  /**
   * @param visible 0..1 overall visibility of the hall
   * @param shell 0..1 opacity of the enclosure (1 = closed building, 0 = gone)
   */
  update(visible: number, shell: number, time: number) {
    this.group.visible = visible > 0.001
    const solid = visible > 0.98
    for (const mat of [this.rackMat, this.trayMat]) {
      mat.uniforms.uVisible.value = visible
      mat.uniforms.uTime.value = time
      mat.depthWrite = solid
    }
    this.floorMat.uniforms.uVisible.value = visible
    this.shell.visible = shell > 0.001 && this.group.visible
    // Walls, roof and rooftop units share one fade curve so nothing pops out early.
    const shellVis = visible * Math.min(1, shell * 1.6)
    setHoloFade(this.shellMat, shellVis, 0.92 * shell)
    setHoloFade(this.roofUnitMat, shellVis, 0.92 * shell)
  }
}
