// Fetches a few live numbers from the GitHub API into src/generated/stats.json,
// which vite.config.ts injects into index.html at build time.
// Runs in CI before every build (GITHUB_TOKEN raises the rate limit) and works
// unauthenticated locally. On any error the previous file is kept untouched.
import { readFile, writeFile } from 'node:fs/promises'

const OUT = new URL('../src/generated/stats.json', import.meta.url)
const USER = 'PhilippMatthes'
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'philippmatth.es-stats',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}

async function get(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`)
  return res
}
const json = async (path) => (await get(path)).json()

/** Number of items in a list endpoint, read from the Link header with per_page=1. */
async function count(path) {
  const res = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=1`)
  const last = res.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/)
  if (last) return Number(last[1])
  return (await res.json()).length
}

/** Merged pull requests by USER in a repository (search API). */
async function mergedPrs(repo) {
  const q = encodeURIComponent(`repo:${repo} is:pr is:merged author:${USER}`)
  return (await json(`/search/issues?q=${q}&per_page=1`)).total_count
}

async function main() {
  const [cortex, perses] = await Promise.all([json('/repos/cobaltcore-dev/cortex'), json('/repos/perses/perses')])
  const stats = {
    updated: new Date().toISOString(),
    cortex: {
      stars: cortex.stargazers_count,
      commits: await count(`/repos/cobaltcore-dev/cortex/commits?author=${USER}`),
      prs: await mergedPrs('cobaltcore-dev/cortex'),
    },
    perses: {
      stars: perses.stargazers_count,
    },
  }
  for (const [k, v] of Object.entries({ ...stats.cortex, ...stats.perses })) {
    if (!Number.isFinite(v)) throw new Error(`missing value: ${k}`)
  }
  await writeFile(OUT, JSON.stringify(stats, null, 2) + '\n')
  console.log('stats updated', JSON.stringify(stats))
}

main().catch(async (e) => {
  const prev = await readFile(OUT, 'utf8').catch(() => null)
  console.warn(`stats: keeping ${prev ? 'previous values' : 'nothing (no previous file)'}:`, e.message)
  // Never fail the deploy over stats.
})
