import './style.css'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { Stage } from './core/stage'
import { Scroll } from './core/scroll'
import { Pointer } from './core/pointer'
import { CameraRig } from './core/cameraRig'
import { applyMood } from './core/mood'
import { FpsWatchdog, detectQuality, lowerTier, reducedMotion } from './core/quality'
import { T, band, morphAt, range, smooth, SCROLL_VH } from './core/timeline'
import { MorphParticles } from './fx/particles'
import { Hud } from './fx/hud'
import { ChapterNav } from './fx/chapterNav'
import { samplePortrait } from './chapters/portrait'
import { PortraitMesh } from './chapters/portraitMesh'
import { Backdrop } from './chapters/backdrop'
import { Datacenter, hallTargets } from './chapters/datacenter'
import { Network } from './chapters/network'
import { Server } from './chapters/server'
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
    samplePortrait(N, photoUrl, depthUrl),
    PortraitMesh.load(photoUrl, depthUrl),
    Backdrop.load(Math.round(N * 0.35), photoUrl, depthUrl, `${BASE}assets/selfie-scene-depth.webp`),
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
    dashboard.group,
    insight.group,
    cityOverlay.group,
    globe.group,
    particles.points,
  )
  particles.u.uCloudGround.value = CLOUD_CENTER.y

  // The land mask is the heaviest asset; load it once the cover is on screen.
  globeTargets(N)
    .then((g) => particles.setGlobe(g))
    .catch((e) => console.warn('globe data unavailable', e))

  const hud = new Hud(cloud.objects)
  hud.add(globe.anchors.dresden, 'globe', `<i></i>${PLACES.dresden.label}`, '#ffffff', 'place')
  PANELS.forEach((panel, i) => hud.add(dashboard.titleAnchors[i], 'dash', panel.title, '#9fd8ff', 'panel-title', 'left'))
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
  const scrims: Array<[number, number]> = [...document.querySelectorAll<HTMLElement>('.chapter.left, .chapter.right')].map(
    (el) => {
      const r = el.dataset.band!.split(',').map(Number)
      return [r[0], r[3]]
    },
  )

  let last = performance.now()
  const start = last
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const time = (now - start) / 1000

    scroll.update(now, dt)
    pointer.update(dt, now)
    const p = scroll.progress

    if (rig.update(p, dt, pointer, time)) stage.updatePointScale()
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
    server.update({
      visible: p > 0.38 ? 1 - smooth(range(p, T.hallOut[0], T.hallOut[1])) : 0,
      slide,
      lid,
      flows,
      heat,
      time,
      scale,
    })
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

    hud.update(p, stage.camera, reveal, {
      globe: smooth(range(p, 0.975, 0.99)),
      dash: dashVis,
      wave: cityVis * band(p, T.greenWave[0], T.greenWave[0] + 0.01, T.greenWave[1] - 0.01, T.greenWave[1]),
    })
    root.style.setProperty('--hint', String(1 - range(p, 0, 0.012)))
    // Small screens: darken behind the copy while a side chapter is on screen.
    root.style.setProperty('--scrim', Math.max(0, ...scrims.map(([a, b]) => band(p, a, a + 0.015, b - 0.015, b))).toFixed(3))
    chapterNav.update(p)
    if (debugEl) debugEl.textContent = `p ${p.toFixed(3)}  morph ${morphAt(p).toFixed(2)}  ${quality.tier}`

    stage.render(dt)
    watchdog.tick(now)
    requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', () => watchdog.reset())
  requestAnimationFrame((t) => {
    last = t
    frame(t)
    document.body.classList.add('ready')
  })
}

boot().catch((e) => {
  console.error(e)
  document.body.classList.add('no-webgl')
})
