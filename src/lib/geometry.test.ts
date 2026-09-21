import assert from 'node:assert/strict'
import { applyHomography, homography, quadIsUsable } from './geometry.ts'

const from = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
] as const
const to = [
  { x: 12, y: 18 },
  { x: 140, y: 30 },
  { x: 128, y: 260 },
  { x: 4, y: 210 },
] as const

const mapped = homography(from, to)
for (let i = 0; i < 4; i++) {
  const point = applyHomography(mapped, from[i].x, from[i].y)
  assert.ok(Math.abs(point.x - to[i].x) < 1e-4, `x ${i}`)
  assert.ok(Math.abs(point.y - to[i].y) < 1e-4, `y ${i}`)
}

assert.equal(quadIsUsable(from), true)
assert.equal(
  quadIsUsable([
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 10, y: 0 },
  ]),
  false,
)

console.log('geometry ok')
