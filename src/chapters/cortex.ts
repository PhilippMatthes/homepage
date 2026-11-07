import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import { loadRamp, palette } from '../core/palette'
import { smooth, range } from '../core/timeline'
import { CEILING_Y, RACK, SERVER, TARGET, U, rackX, rowZ } from '../world/layout'

/**
 * Cortex, shown instead of told: VMs drop in from the cable trays and get
 * bin-packed (best fit) into hosts on the racks around the target server.
 * Then a few hosts run hot and Cortex rebalances single VMs to cooler hosts.
 */

/** Hosts are 2U servers; each offers 4 capacity units across the rack front. */
const UNITS = 4
const HOST_U = 2
const UNIT_W = (RACK.w - 0.1) / UNITS
const COLS = [4, 5, 6, 7, 8, 9, 10]
const SLOTS = Array.from({ length: 14 }, (_, i) => 8 + i * HOST_U)
const FILL = 0.72
const HOT = palette.amber

interface Host {
  col: number
  slot: number
  used: number
  hot: boolean
}
interface Vm {
  host: number
  unit: number
  units: number
  start: number
  tint: Color
  /** Set for the VMs that get rebalanced. */
  move?: { host: number; unit: number }
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Cortex {
  readonly group = new Group()
  private mesh: InstancedMesh
  private material = new MeshBasicMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  private hosts: Host[] = []
  private vms: Vm[] = []
  private m = new Matrix4()
  private a = new Vector3()
  private b = new Vector3()
  private c = new Color()
  /** Front-face centers of the hosts that run hot (for the rack LEDs). */
  readonly hotSpots: Vector3[] = []
  /** x range and front-face z of the racks Cortex schedules onto. */
  readonly region = {
    x0: rackX(COLS[0]) - RACK.w / 2,
    x1: rackX(COLS[COLS.length - 1]) + RACK.w / 2,
    z: rowZ(TARGET.row) + RACK.d / 2,
  }

  constructor() {
    const rand = rng(7)
    for (const col of COLS) {
      for (const slot of SLOTS) {
        // Leave the target server's slot alone so it can slide out cleanly.
        if (col === TARGET.col && slot <= SERVER.slot && slot + HOST_U > SERVER.slot) continue
        this.hosts.push({ col, slot, used: 0, hot: false })
      }
    }

    // Best-fit packing: every VM goes to the host it fills most tightly.
    const capacity = this.hosts.length * UNITS
    let placed = 0
    const sizes = [1, 1, 1, 2, 2, 4]
    while (placed < capacity * FILL) {
      const units = sizes[Math.floor(rand() * sizes.length)]
      let best = -1
      let bestLeft = Infinity
      this.hosts.forEach((h, i) => {
        const left = UNITS - h.used - units
        if (left >= 0 && (left < bestLeft || (left === bestLeft && rand() < 0.3))) {
          best = i
          bestLeft = left
        }
      })
      if (best < 0) break
      const h = this.hosts[best]
      // Seated VMs sit in the calm middle of the load ramp (cyan → ice).
      const tint = loadRamp(0.42 + rand() * 0.28)
      this.vms.push({ host: best, unit: h.used, units, start: 0, tint })
      h.used += units
      placed += units
    }
    // Drop order: roughly front-to-back along the aisle, so the camera sees a wave.
    const order = this.vms.map((_, i) => i).sort(() => rand() - 0.5)
    order.forEach((vmIdx, k) => (this.vms[vmIdx].start = (k / order.length) * 0.78))

    // Hot hosts near the camera's view, each sheds its last VM to a cool host.
    const near = (h: Host) => Math.abs(h.col - TARGET.col) <= 2 && h.slot >= 14 && h.slot <= 30
    const full = this.hosts.map((h, i) => [h, i] as const).filter(([h]) => h.used === UNITS && near(h))
    for (const [hot, hi] of full.sort(() => rand() - 0.5).slice(0, 4)) {
      hot.hot = true
      const vm = [...this.vms].reverse().find((v) => v.host === hi && !v.move)
      if (!vm) continue
      let dst = -1
      let dstLeft = Infinity
      this.hosts.forEach((h, i) => {
        const left = UNITS - h.used - vm.units
        if (i !== hi && !h.hot && left >= 0 && near(h) && left < dstLeft) {
          dst = i
          dstLeft = left
        }
      })
      if (dst < 0) continue
      vm.move = { host: dst, unit: this.hosts[dst].used }
      this.hosts[dst].used += vm.units
      hot.used -= vm.units
    }

    this.hosts.forEach((h, i) => h.hot && this.hotSpots.push(this.seat(i, 0, UNITS, new Vector3())))

    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, this.vms.length)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.setColorAt(0, new Color())
    this.group.add(this.mesh)
  }

  /** World position of a VM's center when seated in `host` at capacity `unit`. */
  private seat(host: number, unit: number, units: number, out: Vector3) {
    const h = this.hosts[host]
    const left = rackX(h.col) - (UNITS * UNIT_W) / 2
    return out.set(
      left + (unit + units / 2) * UNIT_W,
      (h.slot + HOST_U / 2) * U,
      rowZ(TARGET.row) + RACK.d / 2 + 0.008,
    )
  }

  /**
   * @param visible 0..1 overall fade
   * @param place 0..1 progress of the initial placement wave
   * @param rebalance 0..1 progress of the rebalancing moves
   * @returns how hot the overloaded hosts run, and how busy the scheduler is
   *   (both 0..1), so the rack LEDs can follow along
   */
  update(o: { visible: number; place: number; rebalance: number; time: number }) {
    // Heat builds while the racks fill up and drains as Cortex rebalances.
    const heat = smooth(range(o.place, 0.7, 1)) * (1 - smooth(range(o.rebalance, 0.35, 1)))
    const activity = Math.max(Math.sin(Math.PI * o.place), Math.sin(Math.PI * range(o.rebalance, 0.05, 0.75)))
    const state = { heat: heat * o.visible, activity: activity * o.visible }
    this.group.visible = o.visible > 0.001
    if (!this.group.visible) return state

    this.vms.forEach((vm, i) => {
      const t = smooth(range(o.place, vm.start, vm.start + 0.22))
      this.seat(vm.host, vm.unit, vm.units, this.a)
      const p = this.b
      if (t < 1) {
        // Fall from the cable tray in front of the rack, then slide into the slot.
        const fall = Math.min(1, t / 0.65)
        const push = Math.max(0, (t - 0.65) / 0.35)
        p.set(this.a.x, CEILING_Y + 0.15 + (this.a.y - CEILING_Y - 0.15) * fall * fall, this.a.z + 0.35 * (1 - push))
      } else if (vm.move && o.rebalance > 0) {
        // Hop to the cooler host along a short arc in front of the racks.
        const r = smooth(range(o.rebalance, 0.05, 0.75))
        this.seat(vm.move.host, vm.move.unit, vm.units, p)
        p.lerpVectors(this.a, p, r)
        p.z += Math.sin(Math.PI * r) * 0.25
        p.y += Math.sin(Math.PI * r) * 0.06
      } else {
        p.copy(this.a)
      }
      const moving = (t > 0 && t < 1) || (vm.move && o.rebalance > 0.05 && o.rebalance < 0.75)
      this.m.makeScale(vm.units * UNIT_W - 0.016, HOST_U * U * 0.5, moving ? 0.03 : 0.004)
      this.m.setPosition(p)
      this.mesh.setMatrixAt(i, this.m)

      const hot = this.hosts[vm.host].hot ? heat : 0
      const flicker = 0.85 + 0.15 * Math.sin(o.time * 3 + i * 1.7)
      this.c.copy(vm.tint).lerp(HOT, hot)
      // Seated VMs stay subtle so the racks still read; moving and hot ones glow.
      const glow = moving ? 1.3 : (0.28 + 0.5 * hot) * flicker
      this.c.multiplyScalar(o.visible * Math.min(1, t * 3) * glow)
      this.mesh.setColorAt(i, this.c)
    })
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    return state
  }
}
