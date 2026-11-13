# philippmatth.es

My personal homepage: a single scroll-driven three.js scene, served as a static site from GitHub Pages.

Scrolling flies one continuous camera from a cover through seven chapters to a contact page. A single particle system carries the story, morphing from one shape to the next:

- **Cover.** The real photo, displaced in 3D by its depth map (a nod to 3Dify), reacting to the pointer.
- **01 · iOS & Mac.** The photo burns into a LiDAR-style point cloud that rebuilds as an app screen, explodes into its view hierarchy and slams shut.
- **02 · Cloud Infrastructure.** The points rain onto a datacenter hall inside a network of 20+ datacenters.
- **03 · Cortex Scheduler.** The roof fades, VMs drop into racks and get rebalanced, and a 1U server slides out.
- **04 · Agentic Engineering.** Jobs run through an agent pipeline that calls inference on the server's GPU.
- **05 · Data Science.** Data streams up into floating Perses dashboards.
- **06 · Machine Learning.** The dashboards dissolve into a street-scene point cloud that a model classifies.
- **07 · Product Engineering.** The camera zooms out over a city with a green wave on a bike route (PrioBike).
- **Contact & imprint.** A globe: based in Dresden, collaborating worldwide.

Each section has its own palette, blended on scroll (`src/core/palette.ts`, `src/core/mood.ts`). Each chapter's copy is a short lead plus a `<details class="more">` with the rest.

Without WebGL2, without JavaScript, or with `?plain`, the same copy renders as a plain text page (three.js is then never downloaded). The menu links to it as "Text version".

## Develop

Needs Node ≥ 20.19 (see `.nvmrc`).

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview
npm run og         # re-render the social preview images in public/og/ (commit them)
```

URL parameters: `?debug` (progress readout), `?quality=low|medium|high` (force a tier), `?p=0.42` (jump to a scroll position), `?plain` (text version). Keyboard: ←/→ step between chapters; Tab walks through all links and the scene follows focus.

## Structure

| Path | What |
| --- | --- |
| `src/core/timeline.ts` | **The one place to retime the experience.** Scroll ranges for every chapter and the particle morph schedule. |
| `src/core/cameraRig.ts` | Camera keyframes (Catmull-Rom path), pointer parallax, portrait-screen FOV handling. |
| `src/core/stage.ts` | Renderer and post-processing (bloom, tone mapping, vignette, grain, chromatic aberration). |
| `src/fx/particles.ts` | `MorphParticles`: one point set that morphs portrait → LEDs → GPU → point cloud. |
| `src/chapters/*` | Procedural content for each chapter (3D photo, portrait points, hall + network, server, dashboards, point cloud, city, globe). |
| `src/main.ts` → `src/experience.ts` | Boot: picks the plain page or lazily loads the 3D experience, which wires every chapter into one frame loop. |
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
