import './style.css'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { Stage } from './core/stage'
import { Scroll } from './core/scroll'
import { Pointer } from './core/pointer'
import { CameraRig } from './core/cameraRig'
import { applyMood, bloomAt } from './core/mood'
import { FpsWatchdog, densityComp, detectQuality, lowerTier, reducedMotion } from './core/quality'
import { T, band, morphAt, range, smooth, SCROLL_VH } from './core/timeline'
import { MorphParticles } from './fx/particles'
import { Hud } from './fx/hud'
import { ChapterNav } from './fx/chapterNav'
import { Loader } from './fx/loader'
import { samplePortrait } from './chapters/portrait'
import { PortraitMesh } from './chapters/portraitMesh'
import { Backdrop } from './chapters/backdrop'
import { stackCorners, viewStackTargets } from './chapters/viewStack'
import { Datacenter, hallTargets } from './chapters/datacenter'
import { Network } from './chapters/network'
import { Server } from './chapters/server'
import { Cortex } from './chapters/cortex'
import { Agents, CARD_TITLE_W, STATIONS } from './chapters/agents'
import { DASH, Dashboard, PANELS, dashTargets } from './chapters/dashboard'
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
  const stack = viewStackTargets(N)
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
      stack: stack.target,
      stackLayer: stack.layer,
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
  particles.u.uCloudNear.value = CLOUD_CENTER.z + 2.2
  particles.u.uStackN.value.copy(stack.normal)
  // Rack LEDs follow Cortex: where it schedules, and which hosts run hot.
  particles.u.uCortexArea.value.set(cortex.region.x0, cortex.region.x1, cortex.region.z)
  cortex.hotSpots.slice(0, 4).forEach((h, i) => particles.u.uHot.value[i].copy(h))
  particles.u.uHotCount.value = Math.min(4, cortex.hotSpots.length)
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
  // Titles are clipped to their panel / card so they never run into the neighbor on narrow screens.
  PANELS.forEach((panel, i) =>
    hud.add(dashboard.titleAnchors[i], 'dash', panel.title, 'var(--ice)', 'panel-title', 'left', DASH.w - 0.12),
  )
  STATIONS.forEach((st, i) =>
    hud.add(agents.anchors[i], 'agents', st.name, 'var(--spark)', 'panel-title agent-title', 'left', CARD_TITLE_W),
  )
  // The hub's beacon carries the scale of the fleet; the VM count ticks up as the network unfurls.
  const vmCount = hud
    .add(network.beaconTop, 'network', `<i></i>20+ datacenters<b></b>`, 'var(--spark)', 'place')
    .querySelector('b')!
  const vmFmt = new Intl.NumberFormat('en-US')
  let lastVms = -1
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
    // The cover frames itself (rig.heroBand), so it adds no lift here.
    const weight = el.classList.contains('hero') ? 0 : outro ? 0.8 : 1
    // The outro sits bottom-center on every screen, so it lifts the globe everywhere.
    return { r: [r[0] - 0.012, r[1], r[2], r[3] + 0.012], weight, always: outro }
  })
  const sheetQuery = matchMedia('(max-width: 720px), (max-aspect-ratio: 1/1)')
  rig.sheet = sheetQuery.matches
  sheetQuery.addEventListener('change', () => (rig.sheet = sheetQuery.matches))
  // The band the cover bust is fitted into on phones: below the top bar, above the headline.
  // offsetTop ignores the fade-in translate, so this is stable while the copy animates.
  const topbar = document.querySelector<HTMLElement>('.topbar')!
  const heroEl = document.querySelector<HTMLElement>('.chapter.hero')!
  const heroTitle = heroEl.querySelector<HTMLElement>('h1')!
  // Chapter 01 on phones: the app screen is fitted between the top bar and its copy's eyebrow.
  const stackEl = document.querySelector<HTMLElement>('#apps')!
  const stackEyebrow = stackEl.querySelector<HTMLElement>('.eyebrow')!
  const measureHero = () => {
    const h = innerHeight
    rig.heroBand.top = topbar.getBoundingClientRect().bottom / h
    rig.heroBand.bottom = (heroEl.offsetTop + heroTitle.offsetTop) / h
    rig.fit.top = rig.heroBand.top + 0.01
    rig.fit.bottom = (stackEl.offsetTop + stackEyebrow.offsetTop) / h - 0.015
  }
  measureHero()
  addEventListener('resize', measureHero)
  document.fonts?.ready.then(measureHero)
  let copy = -1
  let warp = 0
  // Chapter 01: last frame's progress and when the view stack last slammed shut.
  let lastP = 0
  let slamAt = -100

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
    stage.setWarp(warp, bloomAt(p))
    // Phones: keep the whole app screen (flat or exploded) in view above chapter 01's copy,
    // from when it forms until its points rain onto the datacenter.
    const spread = particles.u.uStackSpread.value // last frame's, set further down
    rig.fit.weight = band(p, T.stack[0] + 0.01, T.stack[1], T.stackSlam[1], T.dissolve[0] + 0.015)
    if (rig.fit.weight > 0) stackCorners(spread, time, rig.fit.points)
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
    // Only a real mouse or finger ripples the face; phone tilt just steers parallax and light.
    const touch = reducedMotion ? 0 : pointer.contact * (1 - range(p, 0.02, 0.05))

    ndc.set(pointer.x, pointer.y)
    raycaster.setFromCamera(ndc, stage.camera)
    if (raycaster.ray.intersectPlane(plane, hit)) particles.u.uPointer.value.copy(hit)

    photoMesh.update(burn, time, hit, touch, pointer)
    // The room only belongs behind the face, so it fades as the face turns into the app screen.
    const scanY = PORTRAIT_CENTER.y + PORTRAIT_SIZE * 0.6 - ((time * 0.22) % 1.6) * PORTRAIT_SIZE * 0.75
    backdrop.update(1 - smooth(range(p, T.stack[0], T.stack[1] - 0.005)), time, scale, scanY)
    datacenter.update(hallVis, shell, time)
    const networkGrow = range(p, T.networkGrow[0], T.networkGrow[1])
    network.update(networkVis, networkGrow, time, scale, stage.dpr)
    const vms = Math.round(100_000 * smooth(range(networkGrow, 0.05, 0.95)) / 100) * 100
    if (vms !== lastVms) vmCount.textContent = `· ${vmFmt.format((lastVms = vms))} VMs`
    const cortexState = cortex.update({
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
    u.uStackMix.value = range(p, T.stack[0], T.stack[1])
    // The view hierarchy explodes with a soft overshoot, then slams shut, accelerating.
    const spreadT = range(p, T.stackSpread[0], T.stackSpread[1]) - 1
    const slamT = range(p, T.stackSlam[0], T.stackSlam[1])
    u.uStackSpread.value = (1 + 2.2 * spreadT * spreadT * spreadT + 1.2 * spreadT * spreadT) * (1 - slamT * slamT * slamT)
    // Scrolling forward through the impact sets off a flash that fades on its own.
    if (p >= T.stackSlam[1] && lastP < T.stackSlam[1] && p < T.dissolve[0] + 0.02) slamAt = time
    lastP = p
    u.uStackFlash.value = reducedMotion ? 0 : 1.4 * Math.exp(-(time - slamAt) * 5)
    u.uGpu.value.copy(server.gpuWorld)
    u.uSweep.value = sweepX
    u.uSweepOn.value = sweepOn
    u.uEye.value.copy(stage.camera.position)
    u.uScanY.value = scanY
    u.uPointerStrength.value = touch
    u.uWarp.value = warp
    u.uCortex.value.set(cortexState.heat, cortexState.activity)

    hud.update(p, stage.camera, reveal, {
      globe: smooth(range(p, 0.975, 0.99)),
      dash: dashVis,
      agents: agentsVis,
      network: networkVis * smooth(range(networkGrow, 0.1, 0.3)),
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
  // Opened on a chapter (deep link), the portrait isn't on screen: no glide.
  const portraitRect = () => {
    if (scroll.progress > 0.03) return null
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
