import { Vector3 } from 'three'
import { GLOBE_CENTER, latLonToWorld } from './layout'

/**
 * The point on Earth where the sun is directly overhead, accurate to well
 * under a degree (declination + equation of time), which is plenty for a
 * soft day/night terminator.
 */
export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = (date.getTime() - start) / 86_400_000
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10))
  const b = ((2 * Math.PI) / 364) * (day - 81)
  const eotMinutes = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  let lon = -15 * (utcHours - 12 + eotMinutes / 60)
  lon = ((((lon + 180) % 360) + 360) % 360) - 180
  return { lat, lon }
}

/** Unit vector from the globe's center towards the sun, in world space. */
export function sunDirection(date = new Date(), out = new Vector3()) {
  const { lat, lon } = subsolarPoint(date)
  return latLonToWorld(lat, lon, out).sub(GLOBE_CENTER).normalize()
}
