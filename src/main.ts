import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './style.css'
import { SCROLL_VH } from './core/timeline'

function supportsWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/** Without WebGL2, or with ?plain, the copy is shown as a plain readable page. */
function plain() {
  document.body.classList.add('no-webgl')
  // There's room for everything here: unfold the second tier of copy.
  document.querySelectorAll('details.more').forEach((d) => d.setAttribute('open', ''))
}

async function boot() {
  document.documentElement.style.setProperty('--scroll-vh', String(SCROLL_VH))
  if (new URLSearchParams(location.search).has('plain') || !supportsWebGL2()) return plain()
  // three.js and the scene only load when they will actually run.
  const { start } = await import('./experience')
  await start()
}

boot().catch((e) => {
  console.error(e)
  plain()
})
