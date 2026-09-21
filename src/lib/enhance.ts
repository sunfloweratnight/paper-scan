export type FilterMode = 'color' | 'gray' | 'bw'

export function enhance(source: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const ctx = output.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0)
  if (mode === 'color') {
    mildEnhance(ctx, output.width, output.height, false)
    return output
  }

  const image = ctx.getImageData(0, 0, output.width, output.height)
  const gray = new Uint8Array(output.width * output.height)
  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    gray[p] = (image.data[i] * 77 + image.data[i + 1] * 150 + image.data[i + 2] * 29) >> 8
  }

  const values = mode === 'bw'
    ? softDocumentBw(gray, output.width, output.height)
    : stretch(gray)

  for (let p = 0, i = 0; p < values.length; p++, i += 4) {
    image.data[i] = values[p]
    image.data[i + 1] = values[p]
    image.data[i + 2] = values[p]
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  if (mode === 'gray') unsharp(ctx, output.width, output.height, 0.35)
  return output
}

function mildEnhance(ctx: CanvasRenderingContext2D, width: number, height: number, grayOnly: boolean): void {
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
    if (y < min) min = y
    if (y > max) max = y
  }
  const low = min + (max - min) * 0.02
  const high = max - (max - min) * 0.02
  const span = Math.max(1, high - low)
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = clampByte(((data[i + c] - low) * 255) / span)
    }
    if (grayOnly) {
      const y = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
      data[i] = y
      data[i + 1] = y
      data[i + 2] = y
    }
  }
  ctx.putImageData(image, 0, 0)
  unsharp(ctx, width, height, 0.45)
}

/** High-contrast document look without crushing text into 1-bit noise. */
function softDocumentBw(gray: Uint8Array, width: number, height: number): Uint8Array {
  const stretched = stretch(gray)
  const radius = Math.max(12, Math.round(Math.min(width, height) / 28))
  const local = localMean(stretched, width, height, radius)
  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const bias = stretched[i] - local[i]
    // Keep more gray levels around strokes instead of hard black/white.
    const value = stretched[i] * 0.55 + (128 + bias * 1.35) * 0.45
    out[i] = clampByte(value)
  }
  return stretch(out)
}

function localMean(gray: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += gray[(y - 1) * width + (x - 1)]
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row
    }
  }
  const out = new Uint8Array(gray.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const area = (x1 - x0) * (y1 - y0)
      const sum =
        integral[y1 * stride + x1] -
        integral[y0 * stride + x1] -
        integral[y1 * stride + x0] +
        integral[y0 * stride + x0]
      out[y * width + x] = sum / area
    }
  }
  return out
}

function stretch(gray: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256)
  for (const value of gray) hist[value]++
  const low = percentile(hist, gray.length, 0.01)
  const high = percentile(hist, gray.length, 0.99)
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

function unsharp(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number): void {
  const sharp = ctx.getImageData(0, 0, width, height)
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = width
  blurCanvas.height = height
  const blurCtx = blurCanvas.getContext('2d')
  if (!blurCtx) return
  blurCtx.filter = 'blur(0.6px)'
  blurCtx.drawImage(ctx.canvas, 0, 0)
  const soft = blurCtx.getImageData(0, 0, width, height)
  for (let i = 0; i < sharp.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const value = sharp.data[i + c] + (sharp.data[i + c] - soft.data[i + c]) * amount
      sharp.data[i + c] = clampByte(value)
    }
  }
  ctx.putImageData(sharp, 0, 0)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
