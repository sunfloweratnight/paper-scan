import { distance, insetCorners, polygonArea, quadIsUsable, type Corners, type Point } from './geometry.ts'

/** Clone so detection never depends on a canvas that is currently styled in the DOM. */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  const ctx = copy.getContext('2d')
  if (!ctx) throw new Error('Canvas を使えません')
  ctx.drawImage(source, 0, 0)
  return copy
}

/** Shrink very large photos before ML detection for stabler heatmaps. */
export function detectionCanvas(source: HTMLCanvasElement, maxEdge = 1600): {
  canvas: HTMLCanvasElement
  scaleX: number
  scaleY: number
} {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge) {
    return { canvas: cloneCanvas(source), scaleX: 1, scaleY: 1 }
  }
  const scale = maxEdge / longest
  const copy = document.createElement('canvas')
  copy.width = Math.max(2, Math.round(source.width * scale))
  copy.height = Math.max(2, Math.round(source.height * scale))
  const ctx = copy.getContext('2d')
  if (!ctx) return { canvas: cloneCanvas(source), scaleX: 1, scaleY: 1 }
  ctx.drawImage(source, 0, 0, copy.width, copy.height)
  return {
    canvas: copy,
    scaleX: source.width / copy.width,
    scaleY: source.height / copy.height,
  }
}

export function orderCorners(points: readonly Point[]): Corners {
  if (points.length !== 4) throw new Error('四隅が4点ではありません')
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  const top = [sorted[0], sorted[1]].sort((a, b) => a.x - b.x)
  const bottom = [sorted[2], sorted[3]].sort((a, b) => a.x - b.x)
  return [top[0], top[1], bottom[1], bottom[0]]
}

export function clampCorners(corners: Corners, width: number, height: number): Corners {
  return [
    { x: clamp(corners[0].x, 0, width - 1), y: clamp(corners[0].y, 0, height - 1) },
    { x: clamp(corners[1].x, 0, width - 1), y: clamp(corners[1].y, 0, height - 1) },
    { x: clamp(corners[2].x, 0, width - 1), y: clamp(corners[2].y, 0, height - 1) },
    { x: clamp(corners[3].x, 0, width - 1), y: clamp(corners[3].y, 0, height - 1) },
  ]
}

export function isSensibleDocument(corners: Corners, width: number, height: number): boolean {
  if (!quadIsUsable(corners)) return false
  const area = Math.abs(polygonArea(corners))
  const imageArea = width * height
  if (area < imageArea * 0.08) return false
  if (area > imageArea * 0.97) return false

  const [tl, tr, br, bl] = corners
  const sides = [distance(tl, tr), distance(tr, br), distance(br, bl), distance(bl, tl)]
  const longest = Math.max(...sides)
  const shortest = Math.min(...sides)
  if (shortest < 16) return false
  if (longest / shortest > 8) return false

  const inset = Math.min(
    tl.x,
    tl.y,
    width - 1 - tr.x,
    tr.y,
    width - 1 - br.x,
    height - 1 - br.y,
    bl.x,
    height - 1 - bl.y,
  )
  if (inset < Math.min(width, height) * 0.008 && area > imageArea * 0.9) return false
  return true
}

export function defaultCorners(width: number, height: number): Corners {
  return insetCorners(width, height, 0.1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
