import { useEffect, useRef, useState } from 'react'

type Props = {
  onCapture: (blob: Blob) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        if (cancelled) {
          stop(stream)
          return
        }
        if (video) {
          video.srcObject = stream
          await video.play()
        }
      } catch {
        if (!cancelled) setError('カメラを開けませんでした。画像ファイルから選んでください。')
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
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.95)
  }

  return (
    <section className="camera">
      <video ref={videoRef} playsInline muted autoPlay />
      {error && <p className="note error">{error}</p>}
      <div className="bar">
        <button type="button" className="ghost" onClick={onClose}>戻る</button>
        <button type="button" className="primary shutter" onClick={capture} disabled={!!error}>
          撮影
        </button>
      </div>
    </section>
  )
}

function stop(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop()
}
