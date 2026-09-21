export type FilterMode = 'color' | 'gray' | 'bw'

export function enhance(source: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const ctx = output.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  ctx.drawImage(source, 0, 0)
  if (mode === 'color') return output

  const image = ctx.getImageData(0, 0, output.width, output.height)
  const gray = new Uint8Array(output.width * output.height)
  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    gray[p] = (image.data[i] * 77 + image.data[i + 1] * 150 + image.data[i + 2] * 29) >> 8
  }
  const values = mode === 'bw'
    ? sauvola(gray, output.width, output.height)
    : stretch(gray)
  for (let p = 0, i = 0; p < values.length; p++, i += 4) {
    image.data[i] = values[p]
    image.data[i + 1] = values[p]
    image.data[i + 2] = values[p]
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return output
}

function stretch(gray: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256)
  for (const value of gray) hist[value]++
  const low = percentile(hist, gray.length, 0.02)
  const high = percentile(hist, gray.length, 0.98)
  const span = Math.max(1, high - low)
  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    out[i] = clampByte(((gray[i] - low) * 255) / span)
  }
  return out
}

function percentile(hist: Uint32Array, total: number, ratio: number): number {
  const target = total * ratio
  let seen = 0
  for (let i = 0; i < 256; i++) {
    seen += hist[i]
    if (seen >= target) return i
  }
  return 255
}

function sauvola(gray: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  const integralSq = new Float64Array(stride * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    let rowSq = 0
    for (let x = 1; x <= width; x++) {
      const value = gray[(y - 1) * width + (x - 1)]
      row += value
      rowSq += value * value
      const index = y * stride + x
      integral[index] = integral[index - stride] + row
      integralSq[index] = integralSq[index - stride] + rowSq
    }
  }

  const radius = Math.max(8, Math.round(Math.min(width, height) / 32))
  const k = 0.2
  const out = new Uint8Array(gray.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const area = (x1 - x0) * (y1 - y0)
      const sum = rect(integral, stride, x0, y0, x1, y1)
      const sumSq = rect(integralSq, stride, x0, y0, x1, y1)
      const mean = sum / area
      const variance = Math.max(0, sumSq / area - mean * mean)
      const threshold = mean * (1 + k * (Math.sqrt(variance) / 128 - 1))
      out[y * width + x] = gray[y * width + x] < threshold ? 0 : 255
    }
  }
  return out
}

function rect(integral: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  return integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
