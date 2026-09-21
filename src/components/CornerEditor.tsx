import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Corners, Point } from '../lib/geometry.ts'

const LABELS = ['左上', '右上', '右下', '左下'] as const

type Props = {
  source: HTMLCanvasElement
  corners: Corners
  onChange: (corners: Corners) => void
}

type ViewBox = {
  left: number
  top: number
  width: number
  height: number
}

export function CornerEditor({ source, corners, onChange }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const [view, setView] = useState<ViewBox>({ left: 0, top: 0, width: 0, height: 0 })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    function measure() {
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const pad = 8
      const availW = Math.max(1, rect.width - pad * 2)
      const availH = Math.max(1, rect.height - pad * 2)
      const scale = Math.min(availW / source.width, availH / source.height)
      const width = Math.max(1, source.width * scale)
      const height = Math.max(1, source.height * scale)
      setView({
        left: (rect.width - width) / 2,
        top: (rect.height - height) / 2,
        width,
        height,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [source])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(source)
    return () => {
      if (source.parentElement === host) host.removeChild(source)
    }
  }, [source])

  function pointFromEvent(event: ReactPointerEvent<HTMLElement>): Point {
    if (view.width <= 0 || view.height <= 0) return corners[0]
    const viewport = viewportRef.current
    if (!viewport) return corners[0]
    const rect = viewport.getBoundingClientRect()
    const x = ((event.clientX - rect.left - view.left) / view.width) * source.width
    const y = ((event.clientY - rect.top - view.top) / view.height) * source.height
    return {
      x: Math.min(source.width - 1, Math.max(0, x)),
      y: Math.min(source.height - 1, Math.max(0, y)),
    }
  }

  function move(index: number, point: Point) {
    const next = [...corners] as [Point, Point, Point, Point]
    next[index] = point
    onChange(next)
  }

  return (
    <div className="viewport" ref={viewportRef}>
      <div
        className="stage"
        style={{
          left: view.left,
          top: view.top,
          width: view.width,
          height: view.height,
        }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.handle')) return
          const point = pointFromEvent(event)
          let nearest = 0
          let best = Number.POSITIVE_INFINITY
          corners.forEach((corner, index) => {
            const dist = (corner.x - point.x) ** 2 + (corner.y - point.y) ** 2
            if (dist < best) {
              best = dist
              nearest = index
            }
          })
          drag.current = nearest
          event.currentTarget.setPointerCapture(event.pointerId)
          move(nearest, point)
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return
          move(drag.current, pointFromEvent(event))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <div ref={hostRef} className="canvas-host" />
        <svg className="quad" viewBox={`0 0 ${source.width} ${source.height}`} aria-hidden="true">
          <polygon points={corners.map((point) => `${point.x},${point.y}`).join(' ')} />
        </svg>
        {corners.map((point, index) => (
          <button
            key={LABELS[index]}
            type="button"
            className="handle"
            aria-label={LABELS[index]}
            style={{
              left: `${(point.x / source.width) * 100}%`,
              top: `${(point.y / source.height) * 100}%`,
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
              drag.current = index
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (drag.current !== index) return
              move(index, pointFromEvent(event))
            }}
            onPointerUp={() => {
              drag.current = null
            }}
          />
        ))}
      </div>
    </div>
  )
}
