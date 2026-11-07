import './style.css'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { Stage } from './core/stage'
import { Scroll } from './core/scroll'
import { Pointer } from './core/pointer'
import { CameraRig } from './core/cameraRig'
import { applyMood } from './core/mood'
import { FpsWatchdog, densityComp, detectQuality, lowerTier, reducedMotion } from './core/quality'
import { T, band, morphAt, range, smooth, SCROLL_VH } from './core/timeline'
import { MorphParticles } from './fx/particles'
import { Hud } from './fx/hud'
import { ChapterNav } from './fx/chapterNav'
import { Loader } from './fx/loader'
import { samplePortrait } from './chapters/portrait'
import { PortraitMesh } from './chapters/portraitMesh'
import { Backdrop } from './chapters/backdrop'
import { Datacenter, hallTargets } from './chapters/datacenter'
import { Network } from './chapters/network'
import { Server } from './chapters/server'
import { Cortex } from './chapters/cortex'
import { Agents, STATIONS } from './chapters/agents'
import { Dashboard, PANELS, dashTargets } from './chapters/dashboard'
import { Insight, buildCloud } from './chapters/insight'
import { City, cityTargets } from './chapters/city'
import { Globe, PLACES, globeTargets } from './chapters/globe'
import { CLOUD_CENTER, CLOUD_EXTENT, GLOBE_CENTER, PORTRAIT_CENTER, PORTRAIT_SIZE } from './world/layout'

const BASE = import.meta.env.BASE_URL

function supportsWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

async function boot() {
  document.documentElement.style.setProperty('--scroll-vh', String(SCROLL_VH))
  if (!supportsWebGL2()) {
    document.body.classList.add('no-webgl')
    return
  }

  const loader = new Loader(`${BASE}assets/selfie.webp`, `${BASE}assets/selfie-depth.webp`)
  let quality = detectQuality()
  const canvas = document.getElementById('gl') as HTMLCanvasElement
  const stage = new Stage(canvas, quality)
  const scroll = new Scroll()
  const pointer = new Pointer()
  const rig = new CameraRig(stage.camera)

  const photoUrl = `${BASE}assets/selfie.webp`
  const depthUrl = `${BASE}assets/selfie-depth.webp`
  const N = quality.particles
  const [portrait, photoMesh, backdrop] = await Promise.all([
    loader.track(samplePortrait(N, photoUrl, depthUrl)),
    loader.track(PortraitMesh.load(photoUrl, depthUrl)),
    loader.track(Backdrop.load(Math.round(N * 0.35), photoUrl, depthUrl, `${BASE}assets/selfie-scene-depth.webp`)),
  ])
  const hall = hallTargets(N)
  const dash = dashTargets(N)
  const cloud = buildCloud(N)
  const city = cityTargets(N)

  const particles = new MorphParticles(
    {
      count: N,
      portrait: portrait.pos,
      portraitColor: portrait.col,
      portraitVis: portrait.vis,
      hall: hall.pos,
      flow: hall.flow,
      dash: dash.base,
      dashInfo: dash.info,
      cloud: cloud.pos,
      cloudClass: cloud.cls,
      city: city.pos,
      cityFlow: city.flow,
      cityWeight: city.weight,
    },
    GLOBE_CENTER,
  )
  const datacenter = new Datacenter()
  const network = new Network()
  const server = new Server(quality.pulses)
  const cortex = new Cortex()
  const agents = new Agents()
  const dashboard = new Dashboard()
  const insight = new Insight(cloud.objects)
  const cityOverlay = new City()
  const globe = new Globe()
  stage.scene.add(
    photoMesh.mesh,
    backdrop.points,
    datacenter.group,
    network.group,
    server.group,
    cortex.group,
    agents.group,
    dashboard.group,
    insight.group,
    cityOverlay.group,
    globe.group,
    particles.points,
  )
  particles.u.uCloudGround.value = CLOUD_CENTER.y
  // Fewer points on lean devices, drawn a little larger so density and glow stay alike.
  particles.u.uDensity.value = densityComp(N)
  backdrop.setDensity(densityComp(N))

  // The land mask is the heaviest asset; load it once the cover is on screen.
  globeTargets(N)
    .then((g) => particles.setGlobe(g))
    .catch((e) => console.warn('globe data unavailable', e))

  const hud = new Hud(cloud.objects)
  const dresdenPin = hud.add(globe.anchors.dresden, 'globe', `<i></i>${PLACES.dresden.label}<b></b>`, '#ffffff', 'place')
  // Local time in Dresden next to the beacon, matching the live day/night on the globe.
  const dresdenClock = dresdenPin.querySelector('b')!
  const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  const tickClock = () => (dresdenClock.textContent = `· ${clockFmt.format(new Date())}`)
  tickClock()
  setInterval(tickClock, 15_000)
  // Same Vector3 instance, so the land dots follow every sun update.
  particles.u.uSunDir.value = globe.sunDir.value
  PANELS.forEach((panel, i) => hud.add(dashboard.titleAnchors[i], 'dash', panel.title, '#9fd8ff', 'panel-title', 'left'))
  STATIONS.forEach((st, i) => hud.add(agents.anchors[i], 'agents', st.name, '#cfe6ff', 'panel-title agent-title', 'left'))
  hud.add(agents.sandboxAnchor, 'agents', 'envoy sandbox', '#3fa9ff', 'panel-title agent-title', 'left')
  hud.add(cityOverlay.head, 'wave', '<i></i>green wave ahead', '#4ade80', 'place')

  const debugEl = new URLSearchParams(location.search).has('debug') ? document.getElementById('debug') : null
  debugEl?.removeAttribute('hidden')

  // Pointer → point on the portrait plane, for the "touch the hologram" ripple.
  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const plane = new Plane(new Vector3(0, 0, 1), -(PORTRAIT_CENTER.z + 0.3))
  const hit = new Vector3(0, 0, 100)

  const watchdog = new FpsWatchdog(() => {
    const next = lowerTier(quality)
    if (!next) return
    quality = { ...next, particles: quality.particles, pulses: quality.pulses }
    stage.setQuality(quality)
  })

  const root = document.documentElement

  const chapterNav = new ChapterNav(scroll)
  // ?p=0.42 jumps straight to a scroll position (debugging, screenshots).
  const params = new URLSearchParams(location.search)
  const jump = params.get('p')
  if (jump !== null && Number.isFinite(+jump)) scroll.jumpTo(Math.min(1, Math.max(0, +jump)))
  const bandOf = (el: HTMLElement) => el.dataset.band!.split(',').map(Number)
  const scrims = [...document.querySelectorAll<HTMLElement>('.chapter.left, .chapter.right')].map((el) => {
    const r = bandOf(el)
    return [r[0], r[3]] as const
  })
  // Bottom-sheet framing: how strongly each chapter's copy pushes the subject up.
  // The lift starts a little before the copy fades in and lets go a little after,
  // so short gaps between chapters don't make the camera bob.
  const frames = [...document.querySelectorAll<HTMLElement>('#overlay [data-band]')].map((el) => {
    const r = bandOf(el)
    const outro = el.classList.contains('outro')
    // The cover camera already looks slightly below the photo; a small lift puts
    // the portrait on the upper golden-ratio line (≈ 38% from the top) on phones.
    const weight = el.classList.contains('hero') ? 0.1 : outro ? 0.8 : 1
    // The outro sits bottom-center on every screen, so it lifts the globe everywhere.
    return { r: [r[0] - 0.012, r[1], r[2], r[3] + 0.012], weight, always: outro }
  })
  const sheetQuery = matchMedia('(max-width: 720px), (max-aspect-ratio: 1/1)')
  rig.sheet = sheetQuery.matches
  sheetQuery.addEventListener('change', () => (rig.sheet = sheetQuery.matches))
  let copy = -1
  let warp = 0

  // CSS variables are only written when they change, to spare per-frame style recalcs.
  const cssVars = new Map<string, string>()
  const setVar = (name: string, value: string) => {
    if (cssVars.get(name) === value) return
    cssVars.set(name, value)
    root.style.setProperty(name, value)
  }

  let last = performance.now()
  const start = last
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const time = (now - start) / 1000

    scroll.update(now, dt)
    pointer.update(dt, now)
    const p = scroll.progress

    const copyTarget = Math.max(
      0,
      ...frames.map(({ r, weight, always }) => (rig.sheet || always ? weight * band(p, r[0], r[1], r[2], r[3]) : 0)),
    )
    copy = copy < 0 ? copyTarget : copy + (copyTarget - copy) * (1 - Math.exp(-dt * 3))
    // Fast scrolling warps the scene; quick to build up, slower to settle.
    const warpTarget = reducedMotion ? 0 : smooth(Math.min(1, Math.max(0, (Math.abs(scroll.velocity) - 0.015) * 14)))
    warp += (warpTarget - warp) * (1 - Math.exp(-dt * (warpTarget > warp ? 6 : 2.5)))
    stage.setWarp(warp)
    if (rig.update(p, dt, pointer, time, copy)) stage.updatePointScale()
    stage.camera.updateMatrixWorld()
    const scale = stage.pointScale
    stage.renderer.setClearColor(applyMood(p, root), 1)

    // Chapter states, all derived from p.
    const burn = -0.06 + 1.18 * smooth(range(p, T.burn[0], T.burn[1]))
    const hallVis = smooth(range(p, T.hallIn[0], T.hallIn[1])) * (1 - smooth(range(p, T.hallOut[0], T.hallOut[1])))
    const shell = 1 - smooth(range(p, T.roof[0], T.roof[1]))
    const networkVis = band(p, T.network[0], T.network[1], T.network[2], T.network[3])
    const slide = smooth(range(p, T.slide[0], T.slide[1]))
    const lid = smooth(range(p, T.lid[0], T.lid[1]))
    const flows = band(p, T.flows[0], T.flows[1], T.flows[2], T.flows[3])
    const heat = band(p, T.heat[0], T.heat[1], T.heat[2], T.heat[3])
    const dashVis = band(p, T.dashVisible[0], T.dashVisible[1], T.dashVisible[2], T.dashVisible[3])
    const insightVis = band(p, T.insight[0], T.insight[1], T.insight[2], T.insight[3])
    const sweepT = smooth(range(p, T.sweep[0], T.sweep[1]))
    const sweepX = CLOUD_CENTER.x - CLOUD_EXTENT.x - 0.3 + sweepT * (2 * CLOUD_EXTENT.x + 0.6)
    const sweepOn = p > T.sweep[0] - 0.02 ? 1 : 0
    const cityVis = band(p, T.cityVisible[0], T.cityVisible[1], T.cityVisible[2], T.cityVisible[3])
    const wave = range(p, T.greenWave[0], T.greenWave[1])
    const globeVis = band(p, T.globeVisible[0], T.globeVisible[1], T.globeVisible[2], T.globeVisible[3])
    const touch = reducedMotion ? 0 : pointer.presence * (1 - range(p, 0.02, 0.05))

    ndc.set(pointer.x, pointer.y)
    raycaster.setFromCamera(ndc, stage.camera)
    if (raycaster.ray.intersectPlane(plane, hit)) particles.u.uPointer.value.copy(hit)

    photoMesh.update(burn, time, hit, touch, pointer)
    // The room stays through the 3D chapter's orbit and fades before the points rain down.
    const scanY = PORTRAIT_CENTER.y + PORTRAIT_SIZE * 0.6 - ((time * 0.22) % 1.6) * PORTRAIT_SIZE * 0.75
    backdrop.update(1 - smooth(range(p, 0.115, 0.15)), time, scale, scanY)
    datacenter.update(hallVis, shell, time)
    network.update(networkVis, time, scale)
    cortex.update({
      visible: band(p, T.cortexVisible[0], T.cortexVisible[1], T.cortexVisible[2], T.cortexVisible[3]),
      place: range(p, T.place[0], T.place[1]),
      rebalance: range(p, T.rebalance[0], T.rebalance[1]),
      time,
    })
    const agentsVis = band(p, T.agents[0], T.agents[1], T.agents[2], T.agents[3])
    server.update({
      visible: p > 0.38 ? 1 - smooth(range(p, T.hallOut[0], T.hallOut[1])) : 0,
      slide,
      lid,
      // The board steps back while the agent pipeline is on screen.
      flows: flows * (1 - agentsVis),
      dim: agentsVis,
      heat,
      time,
      scale,
    })
    // Phones frame the board centered, so the pipeline moves over the GPU there.
    agents.update({ visible: agentsVis, time, origin: server.group.position, dpr: stage.dpr, shift: rig.sheet ? -0.042 : 0 })
    dashboard.update(dashVis)
    const reveal = insight.update({ visible: insightVis, sweepX, sweepOn, time })
    cityOverlay.update(cityVis, wave, time, scale)
    globe.update(globeVis, time, scale)

    const u = particles.u
    u.uTime.value = time
    u.uMorph.value = morphAt(p)
    u.uScale.value = scale
    u.uBurn.value = burn
    u.uGpu.value.copy(server.gpuWorld)
    u.uSweep.value = sweepX
    u.uSweepOn.value = sweepOn
    u.uEye.value.copy(stage.camera.position)
    u.uScanY.value = scanY
    u.uPointerStrength.value = touch
    u.uWarp.value = warp

    hud.update(p, stage.camera, reveal, {
      globe: smooth(range(p, 0.975, 0.99)),
      dash: dashVis,
      agents: agentsVis,
      wave: cityVis * band(p, T.greenWave[0], T.greenWave[0] + 0.01, T.greenWave[1] - 0.01, T.greenWave[1]),
    })
    setVar('--hint', (1 - range(p, 0, 0.012)).toFixed(3))
    // Small screens: darken behind the copy while a side chapter is on screen.
    setVar('--scrim', Math.max(0, ...scrims.map(([a, b]) => band(p, a, a + 0.012, b - 0.012, b))).toFixed(3))
    chapterNav.update(p)
    if (debugEl) debugEl.textContent = `p ${p.toFixed(3)}  morph ${morphAt(p).toFixed(2)}  warp ${warp.toFixed(2)}  ${quality.tier}`

    stage.render(dt)
    watchdog.tick(now)
    requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', () => watchdog.reset())
  // Where the portrait plane lands on screen, so the loader's dot grid can glide onto it.
  const portraitRect = () => {
    const h = PORTRAIT_SIZE / 2
    const a = new Vector3(PORTRAIT_CENTER.x - h, PORTRAIT_CENTER.y + h, PORTRAIT_CENTER.z).project(stage.camera)
    const b = new Vector3(PORTRAIT_CENTER.x + h, PORTRAIT_CENTER.y - h, PORTRAIT_CENTER.z).project(stage.camera)
    const x = ((a.x + 1) / 2) * innerWidth
    const y = ((1 - a.y) / 2) * innerHeight
    return { x, y, size: ((b.x - a.x) / 2) * innerWidth }
  }
  requestAnimationFrame((t) => {
    last = t
    frame(t)
    loader.finish(portraitRect()).then(() => document.body.classList.add('ready'))
  })
}

boot().catch((e) => {
  console.error(e)
  document.body.classList.add('no-webgl')
})
