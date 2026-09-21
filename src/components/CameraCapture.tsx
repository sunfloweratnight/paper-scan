import { useEffect, useRef, useState } from 'react'

type Props = {
  onCapture: (canvas: HTMLCanvasElement) => void
  onClose: () => void
  onPickFile: () => void
}

export function CameraCapture({ onCapture, onClose, onPickFile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    let stream: MediaStream | null = null
    let cancelled = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4032 },
            height: { ideal: 3024 },
          },
        })
        if (cancelled) {
          stop(stream)
          return
        }
        if (video) {
          video.srcObject = stream
          await video.play()
          const track = stream.getVideoTracks()[0]
          const settings = track?.getSettings()
          if (settings?.width && settings?.height) {
            setInfo(`${settings.width}×${settings.height}`)
          }
        }
      } catch {
        if (!cancelled) setError('カメラを開けませんでした。写真から選んでください。')
      }
    }

    void start()
    return () => {
      cancelled = true
      if (video) video.srcObject = null
      if (stream) stop(stream)
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(video, 0, 0)
    onCapture(canvas)
  }

  return (
    <section className="camera workspace">
      <header className="sheet-head">
        <h1>撮る</h1>
        <span className="count">{info ?? '紙全体が入るように'}</span>
      </header>
      <div className="steps" aria-label="手順">
        <span className="now">撮る</span>
        <span>枠</span>
        <span>仕上げ</span>
      </div>
      <div className="camera-stage">
        <video ref={videoRef} playsInline muted autoPlay />
      </div>
      {error && <p className="note error">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="ghost" onClick={onClose}>
          戻る
        </button>
        <button type="button" className="ghost" onClick={onPickFile}>
          写真から選ぶ
        </button>
      </div>
      <button type="button" className="cta" onClick={capture} disabled={!!error}>
        シャッター
      </button>
    </section>
  )
}

function stop(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop()
}
