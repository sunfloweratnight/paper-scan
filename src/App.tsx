import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraCapture } from './components/CameraCapture.tsx'
import { CornerEditor } from './components/CornerEditor.tsx'
import { enhance, type FilterMode } from './lib/enhance.ts'
import {
  clampCorners,
  defaultCorners,
  detectionCanvas,
  isSensibleDocument,
  orderCorners,
} from './lib/detect.ts'
import { quadIsUsable, type Corners } from './lib/geometry.ts'
import { canvasFromBlob, canvasFromSource } from './lib/image.ts'
import { canvasToJpeg, downloadBlob, pagesToPdf } from './lib/pdf.ts'
import { warpDocument } from './lib/warp.ts'

type Stage = 'library' | 'camera' | 'corners' | 'preview'

type Page = {
  id: string
  blob: Blob
  url: string
  width: number
  height: number
  filter: FilterMode
  createdAt: number
}

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'bw', label: '白黒' },
  { id: 'gray', label: 'グレー' },
  { id: 'color', label: 'カラー' },
]

const FILTER_LABEL: Record<FilterMode, string> = {
  bw: '白黒',
  gray: 'グレー',
  color: 'カラー',
}

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const detectGen = useRef(0)
  const [stage, setStage] = useState<Stage>('library')
  const [pages, setPages] = useState<Page[]>([])
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const [corners, setCorners] = useState<Corners | null>(null)
  const [warped, setWarped] = useState<HTMLCanvasElement | null>(null)
  const [filter, setFilter] = useState<FilterMode>('color')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reordering, setReordering] = useState(false)

  const enhanced = useMemo(() => (warped ? enhance(warped, filter) : null), [warped, filter])

  async function openSource(input: Blob | HTMLCanvasElement) {
    setError(null)
    setBusy(true)
    try {
      const canvas = input instanceof HTMLCanvasElement
        ? canvasFromSource(input)
        : await canvasFromBlob(input)
      setSource(canvas)
      setCorners(defaultCorners(canvas.width, canvas.height))
      setStage('corners')
      void detect(canvas)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像を読めませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function detect(canvas: HTMLCanvasElement) {
    const generation = ++detectGen.current
    setNote('書類の位置を探しています…')
    try {
      const prepared = detectionCanvas(canvas)
      const { Quadscan } = await import('quadscan')
      const result = await Quadscan.scan(prepared.canvas, {
        mode: 'detect',
        minDetectionConfidence: 0.08,
        onProgress(event) {
          if (detectGen.current !== generation) return
          if (event.phase === 'model-download') setNote('検出モデルをダウンロードしています…')
          if (event.phase === 'model-compile') setNote('モデルを準備しています…')
        },
      })
      if (detectGen.current !== generation) return
      if (result.success && result.corners) {
        const scaled = clampCorners(
          [
            {
              x: result.corners.topLeft.x * prepared.scaleX,
              y: result.corners.topLeft.y * prepared.scaleY,
            },
            {
              x: result.corners.topRight.x * prepared.scaleX,
              y: result.corners.topRight.y * prepared.scaleY,
            },
            {
              x: result.corners.bottomRight.x * prepared.scaleX,
              y: result.corners.bottomRight.y * prepared.scaleY,
            },
            {
              x: result.corners.bottomLeft.x * prepared.scaleX,
              y: result.corners.bottomLeft.y * prepared.scaleY,
            },
          ],
          canvas.width,
          canvas.height,
        )
        const ordered = orderCorners(scaled)
        if (isSensibleDocument(ordered, canvas.width, canvas.height)) {
          setCorners(ordered)
          setNote(null)
          return
        }
      }
      setCorners(defaultCorners(canvas.width, canvas.height))
      setNote('自動では枠を決めきれませんでした。角をドラッグして合わせてください。')
    } catch {
      if (detectGen.current === generation) {
        setCorners(defaultCorners(canvas.width, canvas.height))
        setNote('自動検出に失敗しました。角をドラッグして合わせてください。')
      }
    }
  }

  function readFile(file: File | undefined) {
    if (!file) return
    void openSource(file)
  }

  function showPreview() {
    if (!source || !corners) return
    if (!quadIsUsable(corners)) {
      setError('四隅が交差しているか、範囲が小さすぎます。')
      return
    }
    setError(null)
    setBusy(true)
    window.setTimeout(() => {
      try {
        setWarped(warpDocument(source, corners))
        setFilter('color')
        setStage('preview')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '正面化に失敗しました')
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  async function addPage() {
    if (!enhanced) return
    setBusy(true)
    try {
      const blob = await canvasToJpeg(enhanced)
      const url = URL.createObjectURL(blob)
      setPages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          blob,
          url,
          width: enhanced.width,
          height: enhanced.height,
          filter,
          createdAt: Date.now(),
        },
      ])
      setStage('library')
      setSource(null)
      setWarped(null)
      setReordering(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ページを保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function savePdf() {
    if (pages.length === 0) return
    setBusy(true)
    try {
      const bytes = await pagesToPdf(pages)
      downloadBlob(new Blob([bytes.slice()], { type: 'application/pdf' }), 'paper-scan.pdf')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF を作れませんでした')
    } finally {
      setBusy(false)
    }
  }

  function removePage(id: string) {
    setPages((current) => {
      const page = current.find((item) => item.id === id)
      if (page) URL.revokeObjectURL(page.url)
      return current.filter((item) => item.id !== id)
    })
  }

  function movePage(id: string, direction: -1 | 1) {
    setPages((current) => {
      const index = current.findIndex((item) => item.id === id)
      const next = index + direction
      if (index < 0 || next < 0 || next >= current.length) return current
      const copy = [...current]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  function cancelToLibrary() {
    detectGen.current += 1
    setSource(null)
    setCorners(null)
    setWarped(null)
    setNote(null)
    setError(null)
    setStage('library')
  }

  return (
    <div className={`app theme-sheet stage-${stage}`}>
      {error && <p className="banner error" role="alert">{error}</p>}
      {busy && <p className="banner busy" role="status">処理しています…</p>}

      {stage === 'library' && (
        <main className="library">
          <header className="sheet-head">
            <h1>原稿</h1>
            <span className="count">{pages.length} ページ</span>
          </header>

          {pages.length === 0 ? (
            <div className="empty-card">
              <p>まだページはありません。</p>
              <p className="muted">下の「ページを追加」から紙を撮るか、写真を選んでください。</p>
            </div>
          ) : (
            <ol className="pages">
              {pages.map((page, index) => (
                <li key={page.id} className="page-card">
                  <img src={page.url} alt="" />
                  <div className="page-meta">
                    <strong>ページ {index + 1}</strong>
                    <span>
                      {FILTER_LABEL[page.filter]} · {relativeTime(page.createdAt)}
                    </span>
                    {reordering && (
                      <div className="page-actions">
                        <button type="button" onClick={() => movePage(page.id, -1)} disabled={index === 0}>
                          上へ
                        </button>
                        <button
                          type="button"
                          onClick={() => movePage(page.id, 1)}
                          disabled={index === pages.length - 1}
                        >
                          下へ
                        </button>
                        <button type="button" className="danger" onClick={() => removePage(page.id)}>
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="tag">{index + 1}</span>
                </li>
              ))}
            </ol>
          )}

          <nav className="dock" aria-label="操作">
            <button
              type="button"
              className={reordering ? 'on' : ''}
              onClick={() => setReordering((value) => !value)}
              disabled={pages.length === 0}
            >
              並べ替え
            </button>
            <button type="button" className="dock-main" onClick={() => setStage('camera')}>
              ページを追加
            </button>
            <button type="button" onClick={() => void savePdf()} disabled={pages.length === 0 || busy}>
              PDF
            </button>
          </nav>

          <div className="sheet-extras">
            <button type="button" className="text-link" onClick={() => fileRef.current?.click()}>
              写真から選ぶ
            </button>
          </div>
        </main>
      )}

      {stage === 'camera' && (
        <CameraCapture
          onClose={cancelToLibrary}
          onPickFile={() => fileRef.current?.click()}
          onCapture={(canvas) => void openSource(canvas)}
        />
      )}

      {stage === 'corners' && source && corners && (
        <main className="workspace">
          <header className="sheet-head">
            <h1>枠</h1>
            <span className="count">角を合わせる</span>
          </header>
          <Steps current="corners" />
          <CornerEditor source={source} corners={corners} onChange={setCorners} />
          {note && <p className="note">{note}</p>}
          <div className="sheet-actions">
            <button type="button" className="ghost" onClick={cancelToLibrary}>
              戻る
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setCorners(defaultCorners(source.width, source.height))
                void detect(source)
              }}
            >
              自動で枠
            </button>
          </div>
          <button type="button" className="cta" onClick={showPreview} disabled={busy}>
            この枠で読み取る
          </button>
        </main>
      )}

      {stage === 'preview' && enhanced && (
        <main className="workspace">
          <header className="sheet-head">
            <h1>仕上げ</h1>
            <span className="count">見え方を選ぶ</span>
          </header>
          <Steps current="preview" />
          <PreviewCanvas canvas={enhanced} />
          <div className="filters" role="group" aria-label="画質">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'on' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button type="button" className="ghost" onClick={() => setStage('corners')}>
              枠に戻る
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void canvasToJpeg(enhanced).then((blob) => downloadBlob(blob, 'page.jpg'))
              }}
            >
              画像だけ保存
            </button>
          </div>
          <button type="button" className="cta" onClick={() => void addPage()} disabled={busy}>
            ページに加える
          </button>
        </main>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          readFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}

function Steps({ current }: { current: 'camera' | 'corners' | 'preview' }) {
  const items = [
    { id: 'camera', label: '撮る' },
    { id: 'corners', label: '枠' },
    { id: 'preview', label: '仕上げ' },
  ] as const
  return (
    <div className="steps" aria-label="手順">
      {items.map((item) => (
        <span key={item.id} className={item.id === current ? 'now' : ''}>
          {item.label}
        </span>
      ))}
    </div>
  )
}

function PreviewCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    function layout() {
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const pad = 8
      const availW = Math.max(1, rect.width - pad * 2)
      const availH = Math.max(1, rect.height - pad * 2)
      const scale = Math.min(availW / canvas.width, availH / canvas.height)
      const width = Math.max(1, canvas.width * scale)
      const height = Math.max(1, canvas.height * scale)
      setBox({
        left: (rect.width - width) / 2,
        top: (rect.height - height) / 2,
        width,
        height,
      })
    }

    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [canvas])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(canvas)
    return () => {
      if (canvas.parentElement === host) host.removeChild(canvas)
    }
  }, [canvas])

  return (
    <div className="viewport" ref={viewportRef}>
      <div
        ref={hostRef}
        className="preview-host"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      />
    </div>
  )
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 45) return 'たった今'
  if (seconds < 3600) return `${Math.round(seconds / 60)}分前`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}時間前`
  return `${Math.round(seconds / 86400)}日前`
}
