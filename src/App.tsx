import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraCapture } from './components/CameraCapture.tsx'
import { CornerEditor } from './components/CornerEditor.tsx'
import { enhance, type FilterMode } from './lib/enhance.ts'
import { insetCorners, quadIsUsable, type Corners } from './lib/geometry.ts'
import { canvasFromBlob } from './lib/image.ts'
import { canvasToJpeg, downloadBlob, pagesToPdf } from './lib/pdf.ts'
import { warpDocument } from './lib/warp.ts'

type Stage = 'library' | 'camera' | 'corners' | 'preview'

type Page = {
  id: string
  blob: Blob
  url: string
  width: number
  height: number
}

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'bw', label: '白黒' },
  { id: 'gray', label: 'グレー' },
  { id: 'color', label: 'カラー' },
]

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const detectGen = useRef(0)
  const [stage, setStage] = useState<Stage>('library')
  const [pages, setPages] = useState<Page[]>([])
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const [corners, setCorners] = useState<Corners | null>(null)
  const [warped, setWarped] = useState<HTMLCanvasElement | null>(null)
  const [filter, setFilter] = useState<FilterMode>('bw')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const enhanced = useMemo(() => (warped ? enhance(warped, filter) : null), [warped, filter])

  async function openBlob(blob: Blob) {
    setError(null)
    setBusy(true)
    try {
      const canvas = await canvasFromBlob(blob)
      setSource(canvas)
      setCorners(insetCorners(canvas.width, canvas.height))
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
      const { Quadscan } = await import('quadscan')
      const result = await Quadscan.scan(canvas, {
        mode: 'detect',
        onProgress(event) {
          if (detectGen.current !== generation) return
          if (event.phase === 'model-download') setNote('検出モデルをダウンロードしています…')
          if (event.phase === 'model-compile') setNote('モデルを準備しています…')
        },
      })
      if (detectGen.current !== generation) return
      if (result.success && result.corners) {
        const found = result.corners
        setCorners([found.topLeft, found.topRight, found.bottomRight, found.bottomLeft])
        setNote(null)
      } else {
        setNote('自動検出できませんでした。四隅をドラッグしてください。')
      }
    } catch {
      if (detectGen.current === generation) {
        setNote('自動検出に失敗しました。四隅を手動で合わせてください。')
      }
    }
  }

  function readFile(file: File | undefined) {
    if (!file) return
    void openBlob(file)
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
        setFilter('bw')
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
        { id: crypto.randomUUID(), blob, url, width: enhanced.width, height: enhanced.height },
      ])
      setStage('library')
      setSource(null)
      setWarped(null)
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

  return (
    <div className="app">
      <header>
        <p className="mark">paper-scan</p>
        {stage === 'library' && <span className="count">{pages.length} ページ</span>}
      </header>

      {error && <p className="note error">{error}</p>}

      {stage === 'library' && (
        <main className="library">
          {pages.length === 0 ? (
            <p className="empty">紙を撮るか、画像を選ぶとここにページが並びます。</p>
          ) : (
            <ol>
              {pages.map((page, index) => (
                <li key={page.id}>
                  <img src={page.url} alt={`ページ ${index + 1}`} />
                  <div>
                    <strong>{index + 1}</strong>
                    <div className="row">
                      <button type="button" onClick={() => movePage(page.id, -1)} disabled={index === 0}>上へ</button>
                      <button type="button" onClick={() => movePage(page.id, 1)} disabled={index === pages.length - 1}>下へ</button>
                      <button type="button" className="danger" onClick={() => removePage(page.id)}>削除</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="bar">
            <button type="button" className="primary" onClick={() => setStage('camera')}>撮影</button>
            <button type="button" onClick={() => fileRef.current?.click()}>画像を選ぶ</button>
            <button type="button" onClick={() => void savePdf()} disabled={pages.length === 0 || busy}>PDF を保存</button>
          </div>
        </main>
      )}

      {stage === 'camera' && (
        <CameraCapture
          onClose={() => setStage('library')}
          onCapture={(blob) => void openBlob(blob)}
        />
      )}

      {stage === 'corners' && source && corners && (
        <main className="workspace">
          <CornerEditor source={source} corners={corners} onChange={setCorners} />
          {note && <p className="note">{note}</p>}
          <div className="bar">
            <button type="button" className="ghost" onClick={() => setStage('library')}>戻る</button>
            <button
              type="button"
              onClick={() => {
                setCorners(insetCorners(source.width, source.height))
                void detect(source)
              }}
            >
              自動検出
            </button>
            <button type="button" className="primary" onClick={showPreview} disabled={busy}>読み取り</button>
          </div>
        </main>
      )}

      {stage === 'preview' && enhanced && (
        <main className="workspace">
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
          <div className="bar">
            <button type="button" className="ghost" onClick={() => setStage('corners')}>四隅に戻る</button>
            <button
              type="button"
              onClick={() => {
                void canvasToJpeg(enhanced).then((blob) => downloadBlob(blob, 'page.jpg'))
              }}
            >
              画像を保存
            </button>
            <button type="button" className="primary" onClick={() => void addPage()} disabled={busy}>ページに追加</button>
          </div>
        </main>
      )}

      {busy && <p className="note busy">処理しています…</p>}
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

function PreviewCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(canvas)
  }, [canvas])

  return (
    <div className="frame preview" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
      <div ref={hostRef} className="canvas-host" />
    </div>
  )
}
