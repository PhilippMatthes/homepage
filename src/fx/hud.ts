import { PerspectiveCamera, Vector3 } from 'three'
import { classes } from '../core/palette'
import { band } from '../core/timeline'
import type { CloudObject } from '../chapters/insight'

interface Pin {
  el: HTMLElement
  pos: Vector3
  /** Index into the reveal array passed to update(), or a named group. */
  key: number | string
  /** CSS translate that places the label relative to its anchor. */
  offset: string
}

/**
 * DOM layer on top of the canvas: chapter copy that fades with scroll and
 * labels pinned to 3D positions (detections in the point cloud, places on the globe).
 */
export class Hud {
  private sections: Array<{ el: HTMLElement; r: number[] }>
  private pins: Pin[] = []
  private layer = document.getElementById('labels')!
  private tmp = new Vector3()

  constructor(objects: CloudObject[]) {
    this.sections = [...document.querySelectorAll<HTMLElement>('[data-band]')].map((el) => ({
      el,
      r: el.dataset.band!.split(',').map(Number),
    }))

    const perClass = new Map<number, number>()
    objects.forEach((obj, idx) => {
      const n = perClass.get(obj.cls) ?? 0
      if (n >= (obj.cls === 3 ? 2 : 3)) return
      perClass.set(obj.cls, n + 1)
      const pos = obj.center.clone()
      pos.y += obj.size.y / 2 + 0.06
      this.add(pos, idx, `<i></i>${obj.label}<b>${obj.confidence.toFixed(2)}</b>`, `#${classes[obj.cls].color.getHexString()}`)
    })
  }

  /** Adds a label pinned to a world position, shown with the reveal value of `key`. */
  add(pos: Vector3, key: number | string, html: string, color = '#9fd8ff', className = '', align: 'above' | 'left' = 'above') {
    const el = document.createElement('div')
    el.className = `label ${className}`.trim()
    el.style.setProperty('--c', color)
    el.innerHTML = html
    this.layer.appendChild(el)
    this.pins.push({ el, pos, key, offset: align === 'left' ? 'translate(0, -50%)' : 'translate(-50%, -100%)' })
  }

  update(p: number, camera: PerspectiveCamera, reveal: number[], groups: Record<string, number>) {
    for (const { el, r } of this.sections) {
      const v = band(p, r[0], r[1], r[2], r[3])
      el.style.opacity = v.toFixed(3)
      el.style.transform = `translate3d(0, ${((1 - v) * (p < r[1] ? 24 : -24)).toFixed(1)}px, 0)`
      el.style.filter = v < 0.999 ? `blur(${((1 - v) * 8).toFixed(1)}px)` : ''
      el.style.visibility = v > 0.001 ? 'visible' : 'hidden'
    }

    const w = innerWidth
    const h = innerHeight
    for (const { el, pos, key, offset } of this.pins) {
      const v = typeof key === 'number' ? reveal[key] ?? 0 : groups[key] ?? 0
      if (v < 0.01) {
        el.style.opacity = '0'
        continue
      }
      this.tmp.copy(pos).project(camera)
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.2 || Math.abs(this.tmp.y) > 1.2) {
        el.style.opacity = '0'
        continue
      }
      const x = ((this.tmp.x + 1) / 2) * w
      const y = ((1 - this.tmp.y) / 2) * h
      el.style.opacity = v.toFixed(3)
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${offset}`
    }
  }
}
