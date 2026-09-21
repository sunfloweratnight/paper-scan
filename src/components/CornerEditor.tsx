import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Corners, Point } from '../lib/geometry.ts'

const LABELS = ['左上', '右上', '右下', '左下'] as const

type Props = {
  source: HTMLCanvasElement
  corners: Corners
  onChange: (corners: Corners) => void
}

export function CornerEditor({ source, corners, onChange }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(source)
    return () => {
      if (source.parentElement === host) host.removeChild(source)
    }
  }, [source])

  function pointFromEvent(event: ReactPointerEvent<HTMLButtonElement>): Point {
    const frame = frameRef.current
    if (!frame) return corners[0]
    const rect = frame.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * source.width
    const y = ((event.clientY - rect.top) / rect.height) * source.height
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
    <div className="frame" ref={frameRef}>
      <div ref={hostRef} className="canvas-host" />
      <svg className="quad" viewBox={`0 0 ${source.width} ${source.height}`} aria-hidden="true">
        <polygon
          points={corners.map((point) => `${point.x},${point.y}`).join(' ')}
        />
      </svg>
      {corners.map((point, index) => (
        <button
          key={LABELS[index]}
          type="button"
          className="handle"
          aria-label={LABELS[index]}
          style={{ left: `${(point.x / source.width) * 100}%`, top: `${(point.y / source.height) * 100}%` }}
          onPointerDown={(event) => {
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
  )
}
