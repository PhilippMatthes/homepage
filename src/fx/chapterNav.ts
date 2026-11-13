import type { Scroll } from '../core/scroll'

interface Chapter {
  id: string
  name: string
  goto: number
  from: number
  to: number
  link: HTMLAnchorElement
  dot: HTMLButtonElement
}

/**
 * Chapter navigation, built from the "Experience" menu entries:
 * - the menu itself (jump to any chapter),
 * - a ticker in the menu button whose chapter name slides horizontally on change,
 * - a vertical rail on the left that fills with scroll progress, with clickable dots.
 */
export class ChapterNav {
  private chapters: Chapter[]
  private button = document.querySelector<HTMLButtonElement>('.menu-button')!
  private list = document.getElementById('experience')!
  private ticker = document.getElementById('current-chapter')!
  private fill: HTMLElement
  private current: Chapter | null | undefined = undefined
  private passed = -1
  private atTop: boolean | null = null

  constructor(private scroll: Scroll) {
    const rail = document.getElementById('rail')!
    rail.innerHTML = '<div class="rail-track"><div class="rail-fill"></div></div><ol></ol>'
    this.fill = rail.querySelector<HTMLElement>('.rail-fill')!
    const ol = rail.querySelector('ol')!

    this.chapters = [...this.list.querySelectorAll<HTMLAnchorElement>('a[data-goto]')].map((link) => {
      const goto = Number(link.dataset.goto)
      const section = document.querySelector<HTMLElement>(link.getAttribute('href')!)
      const r = section?.dataset.band?.split(',').map(Number) ?? [2, 2, 2, 2]
      const name = link.textContent!.replace(' & imprint', '')

      const li = document.createElement('li')
      li.style.top = `${(goto * 100).toFixed(2)}%`
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'rail-dot'
      dot.setAttribute('aria-label', `Go to ${name}`)
      dot.innerHTML = `<i></i><span>${name}</span>`
      dot.addEventListener('click', () => this.go(goto))
      li.appendChild(dot)
      ol.appendChild(li)

      link.addEventListener('click', (e) => {
        e.preventDefault()
        this.setMenu(false)
        this.go(goto)
      })
      return { id: link.getAttribute('href')!.slice(1), name, goto, from: r[0], to: r[3], link, dot }
    })

    this.button.addEventListener('click', (e) => {
      e.stopPropagation()
      this.setMenu(this.list.hidden)
    })
    document.addEventListener('click', () => this.setMenu(false))
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.setMenu(false)
      // ←/→ step between chapters.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const p = this.scroll.raw()
      const gotos = this.chapters.map((c) => c.goto)
      const target = e.key === 'ArrowRight' ? gotos.find((g) => g > p + 0.005) : [0, ...gotos].reverse().find((g) => g < p - 0.005)
      if (target === undefined) return
      e.preventDefault()
      this.go(target)
    })

    // Keyboard and screen reader users: focusing copy that isn't on screen flies there.
    document.getElementById('overlay')!.addEventListener('focusin', (e) => {
      const section = (e.target as HTMLElement).closest<HTMLElement>('[data-band]')
      if (!section || section.classList.contains('on')) return
      const [, b, c] = section.dataset.band!.split(',').map(Number)
      this.scroll.jumpTo(Math.min(1, (b + Math.min(c, 1)) / 2))
    })

    // Deep links: #cortex etc. opens the page at that chapter; editing the hash flies there.
    const initial = this.byHash()
    if (initial) this.scroll.jumpTo(initial.goto)
    window.addEventListener('hashchange', () => {
      const c = this.byHash()
      if (c) this.go(c.goto)
    })
  }

  private byHash() {
    const id = decodeURIComponent(location.hash.slice(1))
    // Renamed chapters keep their old anchors as aliases (data-aliases), so old links still work.
    const alias = id && document.querySelector<HTMLElement>(`[data-aliases~="${CSS.escape(id)}"]`)?.id
    return this.chapters.find((c) => c.id === id || c.id === alias)
  }

  /** Keeps the URL anchor in sync with the chapter on screen, without adding history entries. */
  private setAnchor(c: Chapter | null, p: number) {
    const url = c ? `#${c.id}` : p < 0.04 ? location.pathname + location.search : null
    if (url === null) return // between chapters: keep the last anchor
    if (url === (location.hash || location.pathname + location.search)) return
    history.replaceState(history.state, '', url)
  }

  private go(p: number) {
    this.scroll.scrollTo(p)
  }

  private setMenu(open: boolean) {
    this.list.hidden = !open
    this.button.setAttribute('aria-expanded', String(open))
  }

  /** Slides the old name out to the left and the new one in from the right. */
  private tick(name: string) {
    for (const old of this.ticker.querySelectorAll('span')) {
      old.classList.remove('in')
      old.classList.add('out')
      old.addEventListener('animationend', () => old.remove(), { once: true })
    }
    if (!name) return
    const span = document.createElement('span')
    span.textContent = name
    span.className = 'in'
    this.ticker.appendChild(span)
  }

  update(p: number) {
    this.fill.style.transform = `scaleY(${p.toFixed(4)})`
    const active = this.chapters.find((c) => p >= c.from && p <= c.to) ?? null
    const passed = this.chapters.filter((c) => c.goto <= p).length
    // Back on the cover: drop the anchor (the cover isn't a chapter, so it needs its own check).
    const atTop = p < 0.04
    if (atTop !== this.atTop) {
      this.atTop = atTop
      if (atTop) this.setAnchor(null, p)
    }
    if (active !== this.current) {
      this.current = active
      this.setAnchor(active, p)
      this.tick(active?.name ?? '')
      this.button.classList.toggle('has-chapter', !!active)
    } else if (passed === this.passed) return
    this.passed = passed
    this.chapters.forEach((c, i) => {
      const on = c === active
      c.link.setAttribute('aria-current', String(on))
      c.dot.classList.toggle('active', on)
      c.dot.classList.toggle('passed', i < passed && !on)
    })
  }
}
