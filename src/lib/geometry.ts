export type Point = { x: number; y: number }

export type Corners = readonly [Point, Point, Point, Point]

/** Row-major 3×3 homography. The last element is 1. */
export type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function insetCorners(width: number, height: number, ratio = 0.08): Corners {
  const x = width * ratio
  const y = height * ratio
  return [
    { x, y },
    { x: width - 1 - x, y },
    { x: width - 1 - x, y: height - 1 - y },
    { x, y: height - 1 - y },
  ]
}

export function homography(from: Corners, to: Corners): Homography {
  const matrix: number[][] = []
  const vector: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    vector.push(u)
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    vector.push(v)
  }
  const solved = solveLinear(matrix, vector)
  return [
    solved[0],
    solved[1],
    solved[2],
    solved[3],
    solved[4],
    solved[5],
    solved[6],
    solved[7],
    1,
  ]
}

export function applyHomography(h: Homography, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8]
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  }
}

export function outputSize(corners: Corners, maxEdge = 2400): { width: number; height: number } {
  const [tl, tr, br, bl] = corners
  const width = Math.max(distance(tl, tr), distance(bl, br))
  const height = Math.max(distance(tl, bl), distance(tr, br))
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  }
}

export function quadIsUsable(corners: Corners): boolean {
  const area = Math.abs(polygonArea(corners))
  if (area < 32 * 32) return false
  return !segmentsIntersect(corners[0], corners[1], corners[2], corners[3]) &&
    !segmentsIntersect(corners[1], corners[2], corners[3], corners[0])
}

export function polygonArea(corners: Corners): number {
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function solveLinear(matrix: number[][], vector: number[]): number[] {
  const size = vector.length
  const rows = matrix.map((row, index) => [...row, vector[index]])
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row
    }
    if (Math.abs(rows[pivot][col]) < 1e-10) {
      throw new Error('四隅が一直線上で、正面化できません')
    }
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    const divisor = rows[col][col]
    for (let c = col; c <= size; c++) rows[col][c] /= divisor
    for (let row = 0; row < size; row++) {
      if (row === col) continue
      const factor = rows[row][col]
      for (let c = col; c <= size; c++) rows[row][c] -= factor * rows[col][c]
    }
  }
  return rows.map((row) => row[size])
}
