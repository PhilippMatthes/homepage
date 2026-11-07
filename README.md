# philippmatth.es

My personal homepage: a single scroll-driven three.js scene, served as a static site from GitHub Pages.

Scrolling flies one continuous camera through nine chapters. A single particle system carries the story, morphing from one shape to the next:

1. **Cover.** The real photo, displaced in 3D by its depth map (a nod to 3Dify), reacting to the pointer.
2. **3D & shaders.** The photo burns away into a LiDAR-style point cloud while the camera orbits the head.
3. **SAP Cloud Infrastructure.** The points rain onto a datacenter in a network of interconnected datacenters.
4. **Cortex.** The roof fades, the camera dives to one rack, and a 1U server slides out of its slot.
5. **CobaltCore.** The lid fades and data pulses race along the board traces into the GPU.
6. **Perses.** The data rises into floating observability dashboards: time series, bars, heatmap and a node graph.
7. **Data science.** The dashboards dissolve into a street-scene point cloud that a model classifies.
8. **PrioBike-HH.** The camera zooms out over a city road network with a green wave on a bike route.
9. **Contact.** The camera zooms out further to a globe: based in Dresden, collaborating worldwide.

Chapter backgrounds and the UI accent drift subtly between moods (`src/core/mood.ts`).

## Develop

Needs Node ≥ 20.19 (see `.nvmrc`).

```sh
npm install
npm run dev        # http://localhost:5173  (append ?debug for a progress readout, ?quality=low|medium|high to force a tier)
npm run build      # type-check + production build into dist/
npm run preview
```

## Structure

| Path | What |
| --- | --- |
| `src/core/timeline.ts` | **The one place to retime the experience.** Scroll ranges for every chapter and the particle morph schedule. |
| `src/core/cameraRig.ts` | Camera keyframes (Catmull-Rom path), pointer parallax, portrait-screen FOV handling. |
| `src/core/stage.ts` | Renderer and post-processing (bloom, tone mapping, vignette, grain, chromatic aberration). |
| `src/fx/particles.ts` | `MorphParticles`: one point set that morphs portrait → LEDs → GPU → point cloud. |
| `src/chapters/*` | Procedural content for each chapter (3D photo, portrait points, hall + network, server, dashboards, point cloud, city, globe). |
| `src/fx/hud.ts` + `index.html` | Copy, labels and metrics. Each `[data-band]` section fades over a scroll range. |
| `tools/depth/estimate.py` | Offline: turns a new photo into `selfie.webp` + `selfie-depth.webp` (Depth Anything V2). |

## Deploy

Every push to `master` builds the site and deploys it with `.github/workflows/deploy.yml`. In the repository settings, set **Pages → Source** to **GitHub Actions**. `public/CNAME` serves the site at `philippmatth.es`. Point the domain's DNS at GitHub Pages: `A` records to GitHub's Pages IPs, or an `ALIAS`/`ANAME` record to `philippmatthes.github.io`.

## New portrait

From an iPhone Portrait-mode photo, using the depth the phone captured (macOS):

```sh
python3 tools/depth/iphone_portrait.py path/to/IMG_XXXX.heic   # --top / --size to adjust the crop
```

From any other photo, estimating depth with Depth Anything V2:

```sh
python3 -m venv tools/depth/.venv
tools/depth/.venv/bin/pip install -r tools/depth/requirements.txt
tools/depth/.venv/bin/python tools/depth/estimate.py ~/Pictures/me.jpg --size 512
```

Both write `public/assets/selfie.webp` and `public/assets/selfie-depth.webp`. Original `.heic` files in `public/assets/` are git-ignored so their metadata never ships.
