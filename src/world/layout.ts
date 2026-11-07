import { Vector3 } from 'three'

/**
 * World layout (meters). Everything lives in one continuous world so the
 * camera can fly between chapters without cuts:
 *
 *   portrait   hovers high above the hall (y ≈ 30)
 *   hall       racks on the floor around the origin, inside an enclosure
 *   server     slides out of the target rack into the aisle
 *   cloud      a holographic point cloud floating above the racks
 *   city       a road network on the ground plane around the cloud
 *   globe      a huge globe below the city, Hamburg at its top (+y)
 */

export const PORTRAIT_CENTER = new Vector3(0, 30, 0)
export const PORTRAIT_SIZE = 4.4
export const PORTRAIT_DEPTH = 2.8
/** Chapter 01: center of the MacBook + iPhone the portrait's points rebuild into. */
export const DEVICES = new Vector3(PORTRAIT_CENTER.x + 0.3, PORTRAIT_CENTER.y - 0.3, PORTRAIT_CENTER.z)

export const RACK = { w: 0.6, h: 2.0, d: 1.0, gap: 0.02, wall: 0.03 }
export const RACKS_PER_ROW = 15
export const ROWS = 8
export const ROW_PITCH = 3.2
export const U = 0.0445 // one rack unit

export const rowZ = (k: number) => (k - (ROWS - 1) / 2) * ROW_PITCH
export const rackX = (i: number) => (i - (RACKS_PER_ROW - 1) / 2) * (RACK.w + RACK.gap)
export const ROW_LENGTH = RACKS_PER_ROW * (RACK.w + RACK.gap)

export const TARGET = { row: 5, col: 7 }
export const TARGET_RACK = new Vector3(rackX(TARGET.col), RACK.h / 2, rowZ(TARGET.row))
/** z of the target rack's front face (racks face +z). */
export const TARGET_FRONT_Z = TARGET_RACK.z + RACK.d / 2

/** A 1U server that fills the rack's inner width. */
export const SERVER = { w: RACK.w - 2 * RACK.wall - 0.004, h: U * 0.96, d: 0.7, slot: 22 }
/** Server center when fully inserted (front flush with the rack front). */
export const SERVER_HOME = new Vector3(
  TARGET_RACK.x,
  SERVER.slot * U + U / 2,
  TARGET_FRONT_Z - SERVER.d / 2 - 0.004,
)
export const SERVER_SLIDE = 0.62

/** The building around the hall. */
export const HALL = {
  halfX: ROW_LENGTH / 2 + 1.6,
  halfZ: (ROWS * ROW_PITCH) / 2 + 0.9,
  height: 3.3,
}
export const CEILING_Y = 2.45

export const CLOUD_CENTER = new Vector3(0, 3.1, 6.0)
export const CLOUD_EXTENT = { x: 4.2, z: 3.0 }

/** City road network, centered under the point cloud. */
export const CITY_CENTER = new Vector3(0, 0, 6.0)
export const CITY_RADIUS = 140

/** Globe: Hamburg sits at the top, right under the city. */
export const GLOBE_RADIUS = 1500
export const GLOBE_CENTER = new Vector3(CITY_CENTER.x, -GLOBE_RADIUS, CITY_CENTER.z)
export const HAMBURG = { lat: 53.55, lon: 10.0 }

const ecef = (lat: number, lon: number, out = new Vector3()) => {
  const a = (lat * Math.PI) / 180
  const b = (lon * Math.PI) / 180
  return out.set(Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a))
}
const UP = ecef(HAMBURG.lat, HAMBURG.lon)
const EAST = new Vector3(0, 0, 1).cross(UP).normalize()
const NORTH = UP.clone().cross(EAST)
const tmp = new Vector3()

/**
 * Maps lat/lon to world space so that Hamburg's surface normal is +y
 * and north points to -z.
 */
export function latLonToWorld(lat: number, lon: number, out = new Vector3(), radius = GLOBE_RADIUS) {
  ecef(lat, lon, tmp)
  return out.set(tmp.dot(EAST), tmp.dot(UP), -tmp.dot(NORTH)).multiplyScalar(radius).add(GLOBE_CENTER)
}
